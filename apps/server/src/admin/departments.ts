import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { error, t } from "elysia"

import { baseApp } from "../../utils/baseApp"
import { departments, departmentDefaultDescription } from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { UUID } from "../../utils/validtors"

// Schema for validating the request body when creating/updating a description
const descriptionBodySchema = t.Object({
  departmentId: t.String({
    format: "uuid",
    error: "Valid department ID is required.",
  }),
})

// Schema for validating URL parameters containing the description ID
const descriptionIdParamsSchema = t.Object({
  id: t.String({
    format: "uuid",
    error: "Description ID must be a valid UUID.",
  }),
})

// Schema for validating query parameters for filtering descriptions
const departmentIdsQuerySchema = t.Object({
  departmentIds: t.Optional(t.Array(UUID)),
})

export const adminDepartmentsRoutes = baseApp("adminDepartments").group(
  "/admin/departments",
  (app) =>
    app
      .use(authGuard("admin")) // Ensure only admins can access these routes
      .get(
        "/",
        async ({ db, query }) => {
          try {
            const { departmentIds } = query

            const descriptionsQuery = db
              .select({
                id: departments.id,
                departmentColor: departments.color,
                departmentName: departments.name,
              })
              .from(departments)
              .orderBy(desc(departments.id))

            if (departmentIds) {
              descriptionsQuery.where(inArray(departments.id, departmentIds))
            }

            const descriptions = await descriptionsQuery

            return descriptions
          } catch (e) {
            console.error("Error fetching default descriptions:", e)
            throw error(500, "Failed to fetch default descriptions")
          }
        },
        {
          query: departmentIdsQuerySchema,
          detail: {
            summary: "Get Default Descriptions (Admin)",
            description:
              "Fetches default time entry descriptions with department names, optionally filtered by department ID. Requires admin privileges.",
            tags: ["Admin", "Descriptions"],
          },
        }
      )
      // --- POST /admin/departments ---
      .post(
        "/",
        async ({ db, body, error }) => {
          try {
            const { departmentId } = body

            const departmentExists = await db.query.departments.findFirst({
              where: eq(departments.id, departmentId),
              columns: { id: true },
            })
            if (!departmentExists) {
              return error(400, `Invalid departmentId: ${departmentId}`)
            }

            const existing =
              await db.query.departmentDefaultDescription.findFirst({
                where: and(
                  eq(departmentDefaultDescription.departmentId, departmentId)
                ),
                columns: { id: true },
              })

            if (existing) {
              return error(
                409,
                `Department already exists for this department.`
              )
            }

            const newDescriptionResult = await db
              .insert(departmentDefaultDescription)
              .values({
                departmentId,
                description: "",
              })
              .returning()

            if (!newDescriptionResult || newDescriptionResult.length === 0) {
              return error(
                500,
                "Failed to create default description after validation"
              )
            }

            return newDescriptionResult[0]
          } catch (e: any) {
            console.error("Error creating default description:", e)
            if (e.code === "23505") {
              return error(
                409,
                "Description already exists for this department (DB constraint)."
              )
            }
            if (e.status) throw e
            return error(500, "Failed to create default description")
          }
        },
        {
          body: descriptionBodySchema,
          detail: {
            summary: "Create Default Description (Admin)",
            description:
              "Creates a new default time entry description for a specific department ID. Requires admin privileges.",
            tags: ["Admin", "Descriptions"],
          },
        }
      )
      // --- PUT /admin/descriptions/:id ---
      .put(
        "/:id",
        async ({ db, params, body, error }) => {
          try {
            const { id } = params
            const { departmentId } = body

            const departmentExists = await db.query.departments.findFirst({
              where: eq(departments.id, departmentId),
              columns: { id: true },
            })
            if (!departmentExists) {
              return error(400, `Invalid departmentId: ${departmentId}`)
            }

            const conflictingDescription =
              await db.query.departmentDefaultDescription.findFirst({
                where: and(
                  eq(departmentDefaultDescription.departmentId, departmentId),
                  ne(departmentDefaultDescription.id, id)
                ),
                columns: { id: true },
              })
            if (conflictingDescription) {
              return error(
                409,
                `Another description with the same text already exists for this department.`
              )
            }

            const updatedDescriptionResult = await db
              .update(departmentDefaultDescription)
              .set({
                departmentId,
              })
              .where(eq(departmentDefaultDescription.id, id))
              .returning()

            if (
              !updatedDescriptionResult ||
              updatedDescriptionResult.length === 0
            ) {
              return error(404, `Default description with ID ${id} not found.`)
            }

            return updatedDescriptionResult[0]
          } catch (e: any) {
            console.error(`Error updating default description ${params.id}:`, e)
            if (e.code === "23505") {
              return error(
                409,
                "This description already exists for the target department (DB constraint)."
              )
            }
            if (e.status) throw e
            return error(500, "Failed to update default description")
          }
        },
        {
          params: descriptionIdParamsSchema,
          body: descriptionBodySchema,
          detail: {
            summary: "Update Default Description (Admin)",
            description:
              "Updates an existing default time entry description, including its assigned department ID. Requires admin privileges.",
            tags: ["Admin", "Descriptions"],
          },
        }
      )
      // --- DELETE /admin/descriptions/:id ---
      .delete(
        "/:id",
        async ({ db, params }) => {
          try {
            const { id } = params

            const deletedDescription = await db
              .delete(departmentDefaultDescription)
              .where(eq(departmentDefaultDescription.id, id))
              .returning({ id: departmentDefaultDescription.id })

            if (!deletedDescription || deletedDescription.length === 0) {
              throw error(404, `Default description with ID ${id} not found.`)
            }

            return { success: true, id: deletedDescription[0].id }
          } catch (e: any) {
            console.error(`Error deleting default description ${params.id}:`, e)
            if (e.status) throw e
            throw error(500, "Failed to delete default description")
          }
        },
        {
          params: descriptionIdParamsSchema,
          detail: {
            summary: "Delete Default Description (Admin)",
            description:
              "Deletes a default time entry description by its ID. Requires admin privileges.",
            tags: ["Admin", "Descriptions"],
          },
        }
      )
)
