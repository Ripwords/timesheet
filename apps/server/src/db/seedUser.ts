import bcrypt from "bcryptjs"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import * as schema from "./schema"
import { config } from "dotenv"

// Load environment variables
config({ path: process.cwd() + "/../../.env" })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.")
}

const client = postgres(connectionString)
const db = drizzle(client, { schema })

// Renamed function to reflect its purpose
export const seedAdminUser = async () => {
  console.log("👤 Attempting to seed admin user...")

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com"
  const adminPassword = process.env.ADMIN_PASSWORD ?? "password"

  // Check if admin user already exists
  const existingAdmin = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail))
    .limit(1)

  if (existingAdmin.length > 0) {
    console.log(`Admin user ${adminEmail} already exists. Updating role...`)
    await db
      .update(schema.users)
      .set({ role: "admin", emailVerified: true, updatedAt: new Date() })
      .where(eq(schema.users.email, adminEmail))
    console.log(`Admin user ${adminEmail} updated to admin role.`)
  } else {
    console.log(`Creating admin user ${adminEmail}...`)
    const hashedPassword = await bcrypt.hash(adminPassword, 10)
    await db.insert(schema.users).values({
      email: adminEmail,
      passwordHash: hashedPassword,
      role: "admin",
      department: "backend", // Or a default/configurable department
      emailVerified: true,
    })
    console.log(`Admin user ${adminEmail} seeded successfully.`)
  }
}
