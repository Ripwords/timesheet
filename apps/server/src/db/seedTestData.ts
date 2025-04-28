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
const DEPARTMENTS_TO_SEED = [
  { name: "Frontend Design", maxSessionMinutes: 480 },
  { name: "Frontend JS", maxSessionMinutes: 480 },
  { name: "Backend", maxSessionMinutes: 480 },
  { name: "UI/UX", maxSessionMinutes: 480 },
  { name: "Digital Marketing", maxSessionMinutes: 420 },
  { name: "Administration", maxSessionMinutes: 540 },
]

const seedTestData = async () => {
  console.log("🌱 Starting test data seeding...")

  // --- 1. Seed Departments ---
  console.log(`🏢 Seeding ${DEPARTMENTS_TO_SEED.length} departments...`)
  await db
    .insert(schema.departments)
    .values(DEPARTMENTS_TO_SEED)
    .onConflictDoNothing() // Ignore if names already exist

  // Fetch seeded departments to get their IDs and map names to IDs
  const seededDepartments = await db
    .select({ id: schema.departments.id, name: schema.departments.name })
    .from(schema.departments)

  if (seededDepartments.length === 0) {
    console.error("❌ Failed to seed or fetch departments. Aborting.")
    process.exit(1)
  }

  const departmentNameToIdMap = new Map(
    seededDepartments.map((d) => [d.name, d.id])
  )
  const departmentIds = seededDepartments.map((d) => d.id)
  console.log(
    `Total departments in DB after seeding: ${seededDepartments.length}`
  )

  // --- 2. Seed Regular Users ---
  console.log(`👥 Seeding ${SEED_USERS_COUNT} regular users...`)
  const userEmails = new Set<string>()
  while (userEmails.size < SEED_USERS_COUNT) {
    const potentialEmail = faker.internet.email()
    if (potentialEmail !== (process.env.ADMIN_EMAIL ?? "admin@example.com")) {
      userEmails.add(potentialEmail)
    }
  }

  const usersToInsert: (typeof schema.users.$inferInsert)[] = []
  for (const email of userEmails) {
    const passwordHash = await bcrypt.hash("password", 10) // Default password
    const randomDepartmentId = faker.helpers.arrayElement(departmentIds) // Pick a random *ID*

    usersToInsert.push({
      email: email,
      passwordHash: passwordHash,
      role: "user",
      accountStatus: "active",
      departmentId: randomDepartmentId, // Assign departmentId FK
      emailVerified: faker.datatype.boolean(0.8),
    })
  }

  // Batch insert users, ignoring conflicts on email
  await db.insert(schema.users).values(usersToInsert).onConflictDoNothing()

  // Fetch all user IDs (including admin, needed for time entries)
  const allUserIds = (
    await db.select({ id: schema.users.id }).from(schema.users)
  ).map((u) => u.id)
  console.log(`Total users in DB after seeding: ${allUserIds.length}`)

  // --- 3. Seed Projects ---
  console.log(`🏗️ Seeding ${SEED_PROJECTS_COUNT} projects...`)
  const projectNames = new Set<string>()
  while (projectNames.size < SEED_PROJECTS_COUNT) {
    projectNames.add(faker.commerce.productName() + " Project")
  }

  const projectsToInsert: (typeof schema.projects.$inferInsert)[] = Array.from(
    projectNames
  ).map((name) => ({ name }))

  await db
    .insert(schema.projects)
    .values(projectsToInsert)
    .onConflictDoNothing()

  const allProjectIds = (
    await db.select({ id: schema.projects.id }).from(schema.projects)
  ).map((p) => p.id)
  console.log(`Total projects in DB after seeding: ${allProjectIds.length}`)

  // --- 3b. Seed Project Budget Injections ---
  console.log(`💸 Seeding budget injections for projects...`)
  const budgetInjectionsToInsert = []
  for (const projectId of allProjectIds) {
    // 1-3 injections per project
    const numInjections = faker.number.int({ min: 1, max: 3 })
    // Total budget for this project: random between 30,000 and 100,000
    const totalBudget = faker.number.int({ min: 30000, max: 100000 })
    // Generate random splits for the injections
    let splits = []
    if (numInjections === 1) {
      splits = [totalBudget]
    } else {
      // Generate (numInjections-1) random cut points, sort, and compute differences
      const cuts = Array.from({ length: numInjections - 1 }, () =>
        faker.number.int({ min: 1, max: totalBudget - 1 })
      )
      cuts.sort((a, b) => a - b)
      splits = [
        cuts[0],
        ...cuts.slice(1).map((c, i) => c - cuts[i]),
        totalBudget - cuts[cuts.length - 1],
      ]
    }
    // Shuffle splits for realism
    faker.helpers.shuffle(splits)
    for (const budget of splits) {
      budgetInjectionsToInsert.push({
        projectId,
        budget: budget.toString(), // numeric expects string
      })
    }
  }
  if (budgetInjectionsToInsert.length > 0) {
    await db
      .insert(schema.projectBudgetInjections)
      .values(budgetInjectionsToInsert)
    console.log(
      `Seeded ${budgetInjectionsToInsert.length} project budget injections.`
    )
  }

  if (allUserIds.length === 0 || allProjectIds.length === 0) {
    console.error("Cannot seed time entries without users and projects.")
    return
  }

  // --- 4. Seed Time Entries ---
  console.log(`⏱️ Seeding ${SEED_TIME_ENTRIES_COUNT} time entries...`)
  const timeEntriesToInsert: (typeof schema.timeEntries.$inferInsert)[] = []
  for (let i = 0; i < SEED_TIME_ENTRIES_COUNT; i++) {
    const durationSeconds = faker.number.int({ min: 300, max: 28800 })
    const endTime = faker.date.recent({ days: 90 })
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

  // --- 5. Seed Department Default Descriptions ---
  console.log("🏷️ Seeding default descriptions for departments...")
  const defaultDescriptionsToInsert: (typeof schema.departmentDefaultDescription.$inferInsert)[] =
    []

  // Descriptions keyed by the *names* defined in DEPARTMENTS_TO_SEED
  const descriptionsByDepartmentName: Record<string, string[]> = {
    "Frontend Design": [
      "Implement UI components from Figma",
      "Style application elements",
      "Ensure responsive design",
      "Design system integration",
    ],
    "Frontend JS": [
      "Develop interactive features",
      "Manage application state (Pinia/Vuex)",
      "Integrate backend APIs",
      "Write unit/integration tests",
      "Optimize frontend performance",
    ],
    Backend: [
      "Design and implement API endpoints",
      "Database schema management (Drizzle)",
      "Implement authentication/authorization",
      "Server deployment and maintenance",
      "Write backend tests",
    ],
    "UI/UX": [
      "User research and analysis",
      "Create wireframes and mockups",
      "Develop user flow diagrams",
      "Conduct usability testing",
      "Prototype interactions",
    ],
    "Digital Marketing": [
      "Plan and execute marketing campaigns",
      "Manage social media presence",
      "Create marketing content (blog, ads)",
      "Analyze campaign performance",
      "SEO optimization",
    ],
    Administration: [
      // Descriptions for the added admin department
      "Manage user accounts",
      "System configuration",
      "Generate reports",
      "General administrative tasks",
    ],
  }

  // Iterate through the map of seeded departments (name -> id)
  for (const [deptName, deptId] of departmentNameToIdMap.entries()) {
    const descriptions = descriptionsByDepartmentName[deptName] || []
    for (const description of descriptions) {
      defaultDescriptionsToInsert.push({
        departmentId: deptId, // Use the department ID
        description: description,
      })
    }
  }

  if (defaultDescriptionsToInsert.length > 0) {
    await db
      .insert(schema.departmentDefaultDescription)
      .values(defaultDescriptionsToInsert)
      .onConflictDoNothing()
    console.log(
      `Seeded ${defaultDescriptionsToInsert.length} default descriptions.`
    )
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
