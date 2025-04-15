import * as bcrypt from "bcryptjs"
import * as dotenv from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import postgres from "postgres"
import * as schema from "./schema"

dotenv.config({ path: "../../.env" })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.")
}

const client = postgres(connectionString)
const db = drizzle(client, { schema })

export const seedAdmin = async () => {
  console.log("Attempting to seed admin user...")

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com"
  const adminPassword = process.env.ADMIN_PASSWORD ?? "password"

  if (!adminEmail || !adminPassword) {
    console.error(
      "ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be set. Skipping seeding."
    )
    // Close connection even if env vars are missing
    await client.end()
    console.log("Database connection closed due to missing env vars.")
    return
  }

  try {
    // Check if admin user already exists
    const existingAdmin = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, adminEmail)) // Now TypeScript knows adminEmail is string
      .limit(1)

    if (existingAdmin.length > 0) {
      console.log(
        `Admin user with email ${adminEmail} already exists. Skipping seeding.`
      )

      // Update existing user to admin role
      await db
        .update(schema.users)
        .set({ role: "admin" })
        .where(eq(schema.users.email, adminEmail))

      console.log(`Admin user ${adminEmail} updated to admin role.`)
      return
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 10) // Now TypeScript knows adminPassword is string

    // Insert the new admin user
    await db.insert(schema.users).values({
      email: adminEmail,
      passwordHash: hashedPassword, // Use passwordHash as suggested by previous error
      role: "admin",
    })

    console.log(`Admin user ${adminEmail} seeded successfully.`)
  } catch (error) {
    console.error("Error during admin seeding process:", error)
  } finally {
    // Ensure the database connection is closed
    // The finally block ensures this runs even if we returned early
    await client.end()
    console.log("Database connection closed.")
  }
}
