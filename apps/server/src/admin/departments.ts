import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { t, error } from "elysia"
import { error as logError } from "@rasla/logify"

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
  id: UUID, // Re-use UUID validator for department ID
})

const departmentBodySchema = t.Object({
  name: t.String({ minLength: 1, error: "Department name cannot be empty." }),
  color: t.UnionEnum([...allowedColors]),
  maxSessionMinutes: t.Number({
    min: 0,
    error: "Max session minutes must be positive.",
  }),
  // Add optional field for default descriptions
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
        async ({ db, query }) => {
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
          } catch (e) {
            logError(`Error fetching departments: ${e}`)
            throw error(500, "Failed to fetch departments")
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
        async ({ db, params }) => {
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
              throw error(404, `Department with ID ${id} not found.`)
            }

            // Fetch associated default descriptions
            const descriptionsData = await db
              .select({
                description: departmentDefaultDescription.description,
              })
              .from(departmentDefaultDescription)
              .where(eq(departmentDefaultDescription.departmentId, id))

            // Combine and return
            return {
              ...departmentData,
              defaultDescriptions: descriptionsData.map((d) => d.description),
            }
          } catch (e: any) {
            logError(`Error fetching department ${params.id}: ${e}`)
            if (e.status) throw e // Re-throw Elysia/NotFound errors
            throw error(500, "Failed to fetch department details")
          }
        },
        {
          params: departmentIdParamsSchema,
          detail: {
            summary: "Get Single Department (Admin)",
            description:
              "Fetches a specific department by its ID, including its default descriptions. Requires admin privileges.",
            tags: ["Admin", "Departments"],
          },
        }
      )
      .post(
        "/",
        async ({ db, body }) => {
          // Use transaction for atomicity
          return db.transaction(async (tx) => {
            try {
              const { name, color, maxSessionMinutes, defaultDescriptions } =
                body

              // Check if department name already exists
              const existing = await tx.query.departments.findFirst({
                where: eq(departments.name, name),
                columns: { id: true },
              })
              if (existing) {
                throw error(
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
                throw error(500, "Failed to create department after validation")
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
              logError(`Error creating department: ${e}`)
              // tx.rollback(); // Drizzle handles rollback on throw automatically
              if (e.status) throw e // Re-throw Elysia errors
              throw error(500, "Failed to create department")
            }
          }) // End transaction
        },
        {
          body: departmentBodySchema,
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
        async ({ db, params, body }) => {
          // Use transaction for atomicity
          return db.transaction(async (tx) => {
            try {
              const { id } = params
              const { name, color, maxSessionMinutes, defaultDescriptions } =
                body

              // Check if another department with the new name already exists
              const conflictingDepartment =
                await tx.query.departments.findFirst({
                  where: and(
                    eq(departments.name, name),
                    ne(departments.id, id)
                  ),
                  columns: { id: true },
                })
              if (conflictingDepartment) {
                throw error(
                  409,
                  `Another department with name "${name}" already exists.`
                )
              }

              // Update department details
              const updatedDepartmentResult = await tx
                .update(departments)
                .set({ name, color, maxSessionMinutes, updatedAt: new Date() })
                .where(eq(departments.id, id))
                .returning()

              if (
                !updatedDepartmentResult ||
                updatedDepartmentResult.length === 0
              ) {
                throw error(404, `Department with ID ${id} not found.`)
              }

              // Manage default descriptions if the field is provided in the body
              if (defaultDescriptions !== undefined) {
                // Delete existing descriptions for this department
                await tx
                  .delete(departmentDefaultDescription)
                  .where(eq(departmentDefaultDescription.departmentId, id))
                  .returning({ id: departmentDefaultDescription.id }) // Log deleted IDs

                // Insert new descriptions if the array is not empty
                if (defaultDescriptions.length > 0) {
                  const descriptionsToInsert = defaultDescriptions.map(
                    (description) => ({
                      departmentId: id,
                      description: description,
                    })
                  )
                  await tx
                    .insert(departmentDefaultDescription)
                    .values(descriptionsToInsert)
                    .returning() // Log inserted rows
                }
              }

              return updatedDepartmentResult[0]
            } catch (e: any) {
              logError(
                `[${params.id || "UNKNOWN"}] Error updating department: ${e}` // Add ID to error log
              )
              // tx.rollback(); // Drizzle handles rollback on throw automatically
              if (e.status) throw e // Re-throw Elysia errors
              throw error(500, "Failed to update department")
            }
          }) // End transaction
        },
        {
          params: departmentIdParamsSchema, // Use the schema for ID validation
          body: departmentBodySchema,
          detail: {
            summary: "Update Department (Admin)",
            description:
              "Updates an existing department's details (name, color, max session). Optionally replaces its default descriptions if provided. Requires admin privileges.",
            tags: ["Admin", "Departments"],
          },
        }
      )
      .delete(
        "/:id",
        async ({ db, params }) => {
          try {
            const { id } = params

            const linkedUsers = await db.query.users.findFirst({
              where: eq(users.departmentId, id),
              columns: { id: true },
            })
            if (linkedUsers) {
              throw error(
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
              throw error(
                400,
                "Cannot delete department: It has default descriptions linked."
              )
            }

            const deletedDepartment = await db
              .delete(departments)
              .where(eq(departments.id, id))
              .returning({ id: departments.id })

            if (!deletedDepartment || deletedDepartment.length === 0) {
              throw error(404, `Department with ID ${id} not found.`)
            }

            return { success: true, id: deletedDepartment[0].id }
          } catch (e: any) {
            logError(`Error deleting department ${params.id}: ${e}`)
            if (e.status) throw e // Re-throw Elysia errors
            throw error(500, e || "Failed to delete department")
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
        async ({ db, query }) => {
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
          } catch (e) {
            logError(`Error fetching departments for descriptions: ${e}`)
            throw error(500, "Failed to fetch department data for descriptions")
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
