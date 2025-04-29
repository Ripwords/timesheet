import { desc } from "drizzle-orm"
import { baseApp } from "../../utils/baseApp"
import { departments } from "../db/schema"
import { error } from "elysia"
import { error as logError } from "@rasla/logify"

export const publicDepartmentsRoutes = baseApp("publicDepartments").group(
  "/departments",
  (app) =>
    app.get(
      "/",
      async ({ db }) => {
        try {
          const descriptionsQuery = db
            .select({
              id: departments.id,
              departmentColor: departments.color,
              departmentName: departments.name,
            })
            .from(departments)
            .orderBy(desc(departments.id))

          const descriptions = await descriptionsQuery

          return descriptions
        } catch (e) {
          logError(`Error fetching default descriptions: ${e}`)
          throw error(500, "Failed to fetch default descriptions")
        }
      },
      {
        detail: {
          summary: "Get Default Descriptions (Admin)",
          description:
            "Fetches default time entry descriptions with department names, optionally filtered by department ID. Requires admin privileges.",
          tags: ["Admin", "Descriptions"],
        },
      }
    )
)
