import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
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

const DEPARTMENTS_TO_SEED = [
  { name: "Frontend Design", maxSessionMinutes: 90, color: "info" },
  { name: "Frontend JS", maxSessionMinutes: 90, color: "error" },
  { name: "Backend", maxSessionMinutes: 90, color: "primary" },
  { name: "UI/UX", maxSessionMinutes: 90, color: "secondary" },
  { name: "Digital Marketing", maxSessionMinutes: 90, color: "success" },
] as (typeof schema.departments.$inferInsert)[]

const seedProdData = async () => {
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.departments)
      .values(DEPARTMENTS_TO_SEED)
      .onConflictDoNothing()

    const seededDepartments = await tx
      .select({ id: schema.departments.id, name: schema.departments.name })
      .from(schema.departments)

    const departmentNameToIdMap = new Map(
      seededDepartments.map((d) => [d.name, d.id])
    )

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
    }

    const defaultDescriptionsToInsert: (typeof schema.departmentDefaultDescription.$inferInsert)[] =
      []

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
      await tx
        .insert(schema.departmentDefaultDescription)
        .values(defaultDescriptionsToInsert)
        .onConflictDoNothing()
      console.log(
        `Seeded ${defaultDescriptionsToInsert.length} default descriptions.`
      )
    }
  })
}

seedProdData()
  .catch((error) => {
    console.error("❌ Test data seeding failed:", error)
    process.exit(1)
  })
  .finally(async () => {
    console.log("🔌 Closing database connection after test data seed.")
    await client.end()
  })
