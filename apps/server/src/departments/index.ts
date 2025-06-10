import { desc, notInArray } from "drizzle-orm"
import { baseApp } from "../../utils/baseApp"
import { departments } from "../db/schema"

export const publicDepartmentsRoutes = baseApp("publicDepartments").group(
  "/departments",
  (app) =>
    app.get(
      "/",
      async ({ db, status }) => {
        try {
          const descriptionsQuery = db
            .select({
              id: departments.id,
              departmentColor: departments.color,
              departmentName: departments.name,
            })
            .from(departments)
            .orderBy(desc(departments.id))

          // Filter any admin/administrative departments
          const descriptions = await descriptionsQuery.where(
            notInArray(departments.name, ["Administration"])
          )

          return descriptions
        } catch {
          return status(500, "Failed to fetch default descriptions")
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
