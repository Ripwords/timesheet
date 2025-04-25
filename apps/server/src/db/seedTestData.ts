import * as bcrypt from "bcryptjs"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema"
import { faker } from "@faker-js/faker"
import { config } from "dotenv"

// Load environment variables
config({ path: process.cwd() + "/../../.env" })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.")
}

const client = postgres(connectionString)
const db = drizzle(client, { schema })

const SEED_USERS_COUNT = 30
const SEED_PROJECTS_COUNT = 20
const SEED_TIME_ENTRIES_COUNT = 500

const seedTestData = async () => {
  console.log("🌱 Starting test data seeding...")

  // --- 1. Seed Regular Users ---
  console.log(`👥 Seeding ${SEED_USERS_COUNT} regular users...`)
  const userEmails = new Set<string>()
  while (userEmails.size < SEED_USERS_COUNT) {
    // Ensure generated emails are not the admin email
    const potentialEmail = faker.internet.email()
    if (potentialEmail !== (process.env.ADMIN_EMAIL ?? "admin@example.com")) {
      userEmails.add(potentialEmail)
    }
  }

  const usersToInsert: (typeof schema.users.$inferInsert)[] = []
  for (const email of userEmails) {
    const passwordHash = await bcrypt.hash("password", 10) // Default password
    usersToInsert.push({
      email: email,
      passwordHash: passwordHash,
      role: "user",
      department:
        faker.helpers.arrayElement(schema.departmentEnum.enumValues) ||
        "frontend_js",
      emailVerified: faker.datatype.boolean(0.8), // 80% chance of being verified
    })
  }

  // Batch insert users, ignoring conflicts on email
  await db.insert(schema.users).values(usersToInsert).onConflictDoNothing()

  // Fetch all user IDs (including admin, needed for time entries)
  const allUserIds = (
    await db.select({ id: schema.users.id }).from(schema.users)
  ).map((u) => u.id)
  console.log(`Total users in DB after seeding: ${allUserIds.length}`)

  // --- 2. Seed Projects ---
  console.log(`🏗️ Seeding ${SEED_PROJECTS_COUNT} projects...`)
  const projectNames = new Set<string>()
  while (projectNames.size < SEED_PROJECTS_COUNT) {
    projectNames.add(faker.commerce.productName() + " Project")
  }

  const projectsToInsert: (typeof schema.projects.$inferInsert)[] = Array.from(
    projectNames
  ).map((name) => ({ name }))

  // Batch insert projects, ignoring conflicts on name (if unique constraint added later)
  await db
    .insert(schema.projects)
    .values(projectsToInsert)
    .onConflictDoNothing()

  // Fetch all project IDs
  const allProjectIds = (
    await db.select({ id: schema.projects.id }).from(schema.projects)
  ).map((p) => p.id)
  console.log(`Total projects in DB after seeding: ${allProjectIds.length}`)

  if (allUserIds.length === 0 || allProjectIds.length === 0) {
    console.error("Cannot seed time entries without users and projects.")
    return // Exit if no users or projects
  }

  // --- 3. Seed Time Entries ---
  console.log(`⏱️ Seeding ${SEED_TIME_ENTRIES_COUNT} time entries...`)
  const timeEntriesToInsert: (typeof schema.timeEntries.$inferInsert)[] = []
  for (let i = 0; i < SEED_TIME_ENTRIES_COUNT; i++) {
    const durationSeconds = faker.number.int({ min: 300, max: 28800 }) // 5 mins to 8 hours
    const endTime = faker.date.recent({ days: 90 }) // End time within the last 90 days (increased from 30)
    const startTime = new Date(endTime.getTime() - durationSeconds * 1000)

    timeEntriesToInsert.push({
      userId: faker.helpers.arrayElement(allUserIds),
      projectId: faker.helpers.arrayElement(allProjectIds),
      description: faker.lorem.sentence(),
      startTime: startTime,
      endTime: endTime,
      durationSeconds: durationSeconds,
    })
  }

  if (timeEntriesToInsert.length > 0) {
    await db.insert(schema.timeEntries).values(timeEntriesToInsert)
  }

  console.log(`✅ Test data seeding complete!`)
}

// --- Execute Seeding ---
seedTestData()
  .catch((error) => {
    console.error("❌ Test data seeding failed:", error)
    process.exit(1)
  })
  .finally(async () => {
    console.log("🔌 Closing database connection after test data seed.")
    await client.end()
  })
