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

const MAX_SESSION_MINUTES = 120

const DEPARTMENTS_TO_SEED = [
  {
    name: "Frontend Design",
    maxSessionMinutes: MAX_SESSION_MINUTES,
    color: "info",
  },
  {
    name: "Frontend JS",
    maxSessionMinutes: MAX_SESSION_MINUTES,
    color: "error",
  },
  { name: "Backend", maxSessionMinutes: MAX_SESSION_MINUTES, color: "primary" },
  { name: "UI/UX", maxSessionMinutes: MAX_SESSION_MINUTES, color: "secondary" },
  {
    name: "Brand Team",
    maxSessionMinutes: MAX_SESSION_MINUTES,
    color: "success",
  },
  {
    name: "Creative",
    maxSessionMinutes: MAX_SESSION_MINUTES,
    color: "warning",
  },
  {
    name: "Copywriter",
    maxSessionMinutes: MAX_SESSION_MINUTES,
    color: "error",
  },
  {
    name: "Tech PM",
    maxSessionMinutes: MAX_SESSION_MINUTES,
    color: "info",
  },
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
      "Brand Team": [
        "Braindump",
        "Content calendar creation",
        "Storyboard creation",
        "Content calendar revision",
        "Liaise with the client",
        "Community management",
        "Plot workload in Blue",
        "Posting schedule",
        "Ads schedule",
        "Ad budget allocation",
        "Ad monitoring",
        "Social media report",
        "Digital marketing report",
        "Briefing (internal / external)",
        "Research (music, content/shooting reference)",
        "Shooting (video/ photoshoot)",
        "Meeting / Discussion (internal/ external)",
        "Shopee listing",
        "Renewal proposal",
        "Chinese copy / translation",
        "Video script",
        "Quotation / Invoice creation",
        "Props preparation for shoot",
        "Copywriting (VC / PC)",
        "Contact report",
        "Billing tracker",
        "Adhoc",
        "Proposal briefing",
        "Brand social audit",
        "Work on Proposal deck ",
        "Research for Proposal",
      ],
      Creative: [
        "Content creation (static / video)",
        "Content revision (static / video)",
        "Research (social content / photoshoot related)",
        "Quality check ",
        "Meeting / Discussion (internal / external)",
        "Briefing (internal/ external)",
        "Upload content to Cloud",
        "Braindump",
        "Shooting (video/ photoshoot)",
        "Props preparation for shoot",
        "Adhoc",
        "Proposal briefing",
        "Work on Proposal deck",
        "Research for Proposal",
      ],
      Copywriter: [
        "Braindump",
        "Copywriting (VC / PC)",
        "Meeting / Discussion (internal / external)",
        "Briefing (internal/ external)",
        "Revision (VC / PC)",
        "Adhoc",
        "Proposal briefing",
        "Brand social audit",
        "Work on Proposal deck ",
        "Research for Proposal",
      ],
      "Tech PM": [
        "Track dev progress",
        "Communicate with client (e.g. meeting, chat)",
        "Team alignment/ Internal meetings",
        "Administrations (e.g. quotes, invoices etc)",
        "UAT",
        "Documentations (e.g. timelines, user guide etc)",
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
