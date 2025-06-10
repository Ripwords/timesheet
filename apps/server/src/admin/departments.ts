import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { t } from "elysia"

import { baseApp } from "../../utils/baseApp"
import { departments, departmentDefaultDescription, users } from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { UUID } from "../../utils/validtors"

// --- Schemas for Department CRUD ---

// Define allowed Nuxt UI colors matching the *database schema*
const allowedColors = [
  "primary",
  "secondary",
  "info",
  "success",
  "warning",
  "error",
  "neutral",
] as const

const departmentIdParamsSchema = t.Object({
  id: UUID,
})

// NEW Schema for PUT body - granular description updates
const departmentUpdateBodySchema = t.Object({
  name: t.Optional(
    t.String({ minLength: 1, error: "Department name cannot be empty." })
  ),
  color: t.Optional(t.UnionEnum([...allowedColors])),
  maxSessionMinutes: t.Optional(
    t.Number({ min: 0, error: "Max session minutes must be positive." })
  ),
  // Granular description changes
  descriptionsToAdd: t.Optional(
    t.Array(t.String({ minLength: 1 }), {
      error: "Descriptions to add must be non-empty strings.",
    })
  ),
  descriptionsToUpdate: t.Optional(
    t.Array(
      t.Object({
        id: UUID, // ID of the description to update
        description: t.String({ minLength: 1 }), // New text
      }),
      { error: "Invalid format for descriptions to update." }
    )
  ),
  descriptionIdsToDelete: t.Optional(
    t.Array(UUID, { error: "Invalid format for description IDs to delete." })
  ),
})

// Schema for POST body (Create) - Keep using simple array for creation
const departmentCreateBodySchema = t.Object({
  name: t.String({ minLength: 1, error: "Department name cannot be empty." }),
  color: t.UnionEnum([...allowedColors]),
  maxSessionMinutes: t.Number({
    min: 0,
    error: "Max session minutes must be positive.",
  }),
  defaultDescriptions: t.Optional(
    t.Array(t.String({ minLength: 1 }), {
      error: "Default descriptions must be a non-empty array of strings.",
    })
  ),
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

      // === NEW Department CRUD Endpoints ===
      .get(
        "/",
        async ({ db, query, status }) => {
          const { departmentIds } = query
          try {
            const allDepartments = db
              .select({
                id: departments.id,
                name: departments.name,
                color: departments.color,
                maxSessionMinutes: departments.maxSessionMinutes,
              })
              .from(departments)
              .orderBy(desc(departments.name))

            if (departmentIds && departmentIds.length > 0) {
              allDepartments.where(inArray(departments.id, departmentIds))
            }

            return await allDepartments
          } catch {
            return status(500, "Failed to fetch departments")
          }
        },
        {
          detail: {
            summary: "Get All Departments (Admin)",
            description:
              "Fetches all departments (ID, name, color). Requires admin privileges.",
            tags: ["Admin", "Departments"],
          },
          query: departmentIdsQuerySchema,
        }
      )
      // === NEW Endpoint: Get Single Department with Descriptions ===
      .get(
        "/:id",
        async ({ db, params, status }) => {
          try {
            const { id } = params

            // Fetch department details
            const departmentData = await db.query.departments.findFirst({
              where: eq(departments.id, id),
              columns: {
                id: true,
                name: true,
                color: true,
                maxSessionMinutes: true,
              },
            })

            if (!departmentData) {
              return status(404, `Department with ID ${id} not found.`)
            }

            // Fetch associated default descriptions with their IDs
            const descriptionsData = await db
              .select({
                id: departmentDefaultDescription.id, // Select the ID
                description: departmentDefaultDescription.description,
              })
              .from(departmentDefaultDescription)
              .where(eq(departmentDefaultDescription.departmentId, id))

            // Combine and return
            return {
              ...departmentData,
              // Map to include both id and description
              defaultDescriptions: descriptionsData, // No mapping needed if select is correct
            }
          } catch (e: any) {
            if (e.status) throw e // Re-throw Elysia/NotFound errors
            return status(500, "Failed to fetch department details")
          }
        },
        {
          params: departmentIdParamsSchema,
          detail: {
            summary: "Get Single Department (Admin)",
            description:
              "Fetches a specific department by its ID, including its default descriptions (with IDs). Requires admin privileges.",
            tags: ["Admin", "Departments"],
          },
        }
      )
      .post(
        "/",
        async ({ db, body, status }) => {
          // Use transaction for atomicity
          return db.transaction(async (tx) => {
            try {
              // Use departmentCreateBodySchema here
              const { name, color, maxSessionMinutes, defaultDescriptions } =
                body

              // Check if department name already exists
              const existing = await tx.query.departments.findFirst({
                where: eq(departments.name, name),
                columns: { id: true },
              })
              if (existing) {
                return status(
                  409,
                  `Department with name "${name}" already exists.`
                )
              }

              // Create the department
              const newDepartmentResult = await tx
                .insert(departments)
                .values({ name, color, maxSessionMinutes })
                .returning()

              if (!newDepartmentResult || newDepartmentResult.length === 0) {
                return status(
                  500,
                  "Failed to create department after validation"
                )
              }

              const newDepartment = newDepartmentResult[0]

              // Insert default descriptions if provided
              if (defaultDescriptions && defaultDescriptions.length > 0) {
                const descriptionsToInsert = defaultDescriptions.map(
                  (description) => ({
                    departmentId: newDepartment.id,
                    description: description,
                  })
                )
                await tx
                  .insert(departmentDefaultDescription)
                  .values(descriptionsToInsert)
              }

              return newDepartment // Return the created department
            } catch (e: any) {
              if (e.status) throw e // Re-throw Elysia errors
              return status(500, "Failed to create department")
            }
          }) // End transaction
        },
        {
          body: departmentCreateBodySchema,
          detail: {
            summary: "Create Department (Admin)",
            description:
              "Creates a new department with name, color, max session time, and optional default descriptions. Requires admin privileges.",
            tags: ["Admin", "Departments"],
          },
        }
      )
      .put(
        "/:id",
        async ({ db, params, body, status }) => {
          // Use transaction for atomicity
          return db.transaction(async (tx) => {
            try {
              const { id } = params
              // Use departmentUpdateBodySchema here
              const {
                name,
                color,
                maxSessionMinutes,
                descriptionsToAdd,
                descriptionsToUpdate,
                descriptionIdsToDelete,
              } = body

              // --- Update Department Core Details (if provided) ---
              const updatePayload: Partial<typeof departments.$inferInsert> = {}
              if (name !== undefined) updatePayload.name = name
              if (color !== undefined) updatePayload.color = color
              if (maxSessionMinutes !== undefined)
                updatePayload.maxSessionMinutes = maxSessionMinutes

              // Check for name conflict only if name is being updated
              if (name !== undefined) {
                const conflictingDepartment =
                  await tx.query.departments.findFirst({
                    where: and(
                      eq(departments.name, name),
                      ne(departments.id, id)
                    ),
                    columns: { id: true },
                  })
                if (conflictingDepartment) {
                  return status(
                    409,
                    `Another department with name "${name}" already exists.`
                  )
                }
                updatePayload.updatedAt = new Date()
              }

              let departmentUpdated = false
              if (Object.keys(updatePayload).length > 0) {
                console.log(`[${id}] Updating core fields:`, updatePayload)
                const updatedDepartmentResult = await tx
                  .update(departments)
                  .set(updatePayload)
                  .where(eq(departments.id, id))
                  .returning({ id: departments.id }) // Only need ID to confirm update

                if (updatedDepartmentResult.length === 0) {
                  // This check happens even if only descriptions are modified
                  // If the department doesn't exist at all, we should error out.
                  const exists = await tx.query.departments.findFirst({
                    where: eq(departments.id, id),
                    columns: { id: true },
                  })
                  if (!exists) {
                    return status(404, `Department with ID ${id} not found.`)
                  }
                  // If it exists but wasn't updated (e.g., no fields changed), it's okay
                }
                departmentUpdated = updatedDepartmentResult.length > 0
                console.log(
                  `[${id}] Core fields update result:`,
                  departmentUpdated
                )
              }

              // --- Process Description Deletions ---
              if (descriptionIdsToDelete && descriptionIdsToDelete.length > 0) {
                console.log(
                  `[${id}] Deleting descriptions by ID:`,
                  descriptionIdsToDelete
                )
                const deleteResult = await tx
                  .delete(departmentDefaultDescription)
                  .where(
                    and(
                      eq(departmentDefaultDescription.departmentId, id),
                      inArray(
                        departmentDefaultDescription.id,
                        descriptionIdsToDelete
                      )
                    )
                  )
                  .returning({ id: departmentDefaultDescription.id })
                console.log(
                  `[${id}] Deleted ${deleteResult.length} description(s) by ID.`
                )
              }

              // --- Process Description Updates ---
              if (descriptionsToUpdate && descriptionsToUpdate.length > 0) {
                console.log(
                  `[${id}] Updating descriptions:`,
                  descriptionsToUpdate
                )
                // Use Promise.all for concurrent updates within the transaction
                await Promise.all(
                  descriptionsToUpdate.map(async (update) => {
                    return tx
                      .update(departmentDefaultDescription)
                      .set({ description: update.description })
                      .where(
                        and(
                          eq(departmentDefaultDescription.departmentId, id),
                          eq(departmentDefaultDescription.id, update.id)
                        )
                      )
                    // Optionally add .returning() if needed
                  })
                )
                console.log(
                  `[${id}] Processed ${descriptionsToUpdate.length} description update(s).`
                )
              }

              // --- Process Description Additions ---
              if (descriptionsToAdd && descriptionsToAdd.length > 0) {
                const descriptionsToInsert = descriptionsToAdd.map(
                  (description) => ({
                    departmentId: id,
                    description: description,
                  })
                )
                console.log(
                  `[${id}] Inserting ${descriptionsToInsert.length} new description(s)...`,
                  descriptionsToInsert
                )
                const insertResult = await tx
                  .insert(departmentDefaultDescription)
                  .values(descriptionsToInsert)
                  .returning()
                console.log(
                  `[${id}] Inserted ${insertResult.length} new description(s).`
                )
              }

              console.log(`[${id}] Department update transaction successful.`)
              // Return a simple success or fetch the updated data again if needed
              // For simplicity, returning success status
              return { success: true, id: id, departmentUpdated }
            } catch (e: any) {
              if (e.status) throw e // Re-throw Elysia errors
              return status(500, "Failed to update department")
            }
          }) // End transaction
        },
        {
          params: departmentIdParamsSchema,
          body: departmentUpdateBodySchema,
          detail: {
            summary: "Update Department (Admin)",
            description:
              "Updates department details and/or performs granular changes (add/update/delete) to its default descriptions. Requires admin privileges.",
            tags: ["Admin", "Departments"],
          },
        }
      )
      .delete(
        "/:id",
        async ({ db, params, status }) => {
          try {
            const { id } = params

            const linkedUsers = await db.query.users.findFirst({
              where: eq(users.departmentId, id),
              columns: { id: true },
            })
            if (linkedUsers) {
              return status(
                400,
                "Cannot delete department: It is currently assigned to users."
              )
            }

            const linkedDescriptions =
              await db.query.departmentDefaultDescription.findFirst({
                where: eq(departmentDefaultDescription.departmentId, id),
                columns: { id: true },
              })
            if (linkedDescriptions) {
              return status(
                400,
                "Cannot delete department: It has default descriptions linked."
              )
            }

            const deletedDepartment = await db
              .delete(departments)
              .where(eq(departments.id, id))
              .returning({ id: departments.id })

            if (!deletedDepartment || deletedDepartment.length === 0) {
              return status(404, `Department with ID ${id} not found.`)
            }

            return { success: true, id: deletedDepartment[0].id }
          } catch (e: any) {
            if (e.status) throw e // Re-throw Elysia errors
            return status(500, e || "Failed to delete department")
          }
        },
        {
          params: departmentIdParamsSchema, // Use the schema for ID validation
          detail: {
            summary: "Delete Department (Admin)",
            description:
              "Deletes a department by its ID. Requires admin privileges.",
            tags: ["Admin", "Departments"],
          },
        }
      )

      // === EXISTING Default Description Endpoints (Review/Relocate if needed) ===
      .get(
        "/descriptions", // Changed path slightly to avoid clash with GET /
        async ({ db, query, status }) => {
          try {
            const { departmentIds } = query

            const descriptionsQuery = db
              .select({
                id: departments.id, // department ID
                departmentColor: departments.color,
                departmentName: departments.name,
                description: departmentDefaultDescription.description,
              })
              .from(departments)
              .innerJoin(
                departmentDefaultDescription,
                eq(departments.id, departmentDefaultDescription.departmentId)
              )
              .groupBy(departments.id)
              .orderBy(desc(departments.name))

            if (departmentIds && departmentIds.length > 0) {
              descriptionsQuery.where(inArray(departments.id, departmentIds))
            }

            const departmentsData = await descriptionsQuery

            return departmentsData
          } catch {
            return status(
              500,
              "Failed to fetch department data for descriptions"
            )
          }
        },
        {
          query: departmentIdsQuerySchema,
          detail: {
            summary: "Get Departments (Filtered for Descriptions) (Admin)",
            description:
              "Fetches department details, optionally filtered by department IDs (likely intended for use with default descriptions). Requires admin privileges.",
            tags: ["Admin", "Descriptions", "Departments"], // Added Departments tag
          },
        }
      )
)
