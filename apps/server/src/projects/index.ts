import { baseApp } from "../../utils/baseApp"
import * as schema from "../db/schema"
import { t } from "elysia"
import { and, count, eq, ilike, gte, lte } from "drizzle-orm"
import dayjs from "dayjs"
import { authGuard } from "../middleware/authGuard"
const querySchema = t.Object({
  page: t.Optional(t.Number({ default: 1 })),
  limit: t.Optional(t.Number({ default: 10 })),
  search: t.Optional(t.String()),
  sort: t.Optional(t.UnionEnum(["createdAt", "name", "id"])),
  order: t.Optional(t.UnionEnum(["asc", "desc"])),
  isActive: t.Optional(t.Boolean({ default: true })),
})

export const projects = baseApp("projects").group("/projects", (app) =>
  app
    .use(authGuard())
    .post(
      "/",
      async ({ db, body, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        try {
          const newProject = await db
            .insert(schema.projects)
            .values({
              name: body.name,
            })
            .returning() // Return the newly created project

          if (!newProject || newProject.length === 0) {
            return status(500, "Failed to create project")
          }

          return newProject[0]
        } catch {
          return status(500, "Internal Server Error")
        }
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
        }),
        detail: {
          summary: "Create a new project",
          tags: ["Projects"],
        },
        adminOnly: true,
      }
    )
    // READ All Projects
    .get(
      "/",
      async ({ db, query }) => {
        const {
          page = 1,
          limit = 10,
          search,
          sort,
          order,
          isActive = true,
        } = query
        console.log("query", query)
        const whereList = []
        if (search) {
          whereList.push(ilike(schema.projects.name, `%${search}%`))
        }
        // Filter by isActive status
        whereList.push(eq(schema.projects.isActive, isActive))

        const allProjects = await db.query.projects.findMany({
          orderBy: (projects, { desc, asc }) => {
            const sortField =
              sort === "createdAt"
                ? projects.createdAt
                : sort === "name"
                ? projects.name
                : projects.id

            return [order === "asc" ? asc(sortField) : desc(sortField)]
          },
          where: and(...whereList),
          limit: limit > 0 ? limit : undefined,
          offset: limit > 0 ? (page - 1) * limit : undefined,
        })

        const total = await db
          .select({ count: count() })
          .from(schema.projects)
          .where(and(...whereList))

        return {
          projects: allProjects,
          total: total[0]?.count ?? 0,
        }
      },
      {
        detail: {
          summary: "Get all projects",
          tags: ["Projects"],
        },
        query: querySchema,
      }
    )
    // READ Single Project
    .get(
      "/id/:id",
      async ({ db, params, status }) => {
        const projectId = params.id
        const project = await db.query.projects.findFirst({
          where: and(
            eq(schema.projects.id, projectId),
            eq(schema.projects.isActive, true)
          ),
          columns: { id: true, name: true, isActive: true },
        })

        if (!project) {
          return status(404, "Project not found")
        }
        return project
      },
      {
        params: t.Object({
          id: t.String({ format: "uuid" }),
        }),
        detail: {
          summary: "Get a single project by ID",
          tags: ["Projects"],
        },
      }
    )
    // UPDATE Project
    .put(
      "/id/:id",
      async ({ db, params, body, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const projectId = params.id

        // Check if project exists first
        const existingProject = await db.query.projects.findFirst({
          where: eq(schema.projects.id, projectId),
          columns: { id: true }, // Only fetch id for existence check
        })

        if (!existingProject) {
          return status(404, "Project not found")
        }

        try {
          const updatedProject = await db
            .update(schema.projects)
            .set({
              name: body.name, // Only update fields present in the body
            })
            .where(eq(schema.projects.id, projectId))
            .returning() // Return the updated project

          if (!updatedProject || updatedProject.length === 0) {
            return status(500, "Failed to update project")
          }

          return updatedProject[0]
        } catch {
          return status(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          id: t.String({
            format: "uuid",
          }),
        }),
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1 })),
        }),
        detail: {
          summary: "Update a project by ID",
          tags: ["Projects"],
        },
        adminOnly: true,
      }
    )
    // DELETE Project (Soft Delete)
    .delete(
      "/id/:id",
      async ({ db, params, status, set, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const projectId = params.id

        try {
          // Check if project exists and is currently active
          const existingProject = await db.query.projects.findFirst({
            where: eq(schema.projects.id, projectId),
            columns: { id: true, isActive: true },
          })

          if (!existingProject) {
            return status(404, "Project not found")
          }

          if (!existingProject.isActive) {
            return status(400, "Project is already inactive")
          }

          // Soft delete: set isActive to false
          const updatedProject = await db
            .update(schema.projects)
            .set({
              isActive: false,
              updatedAt: new Date(),
            })
            .where(eq(schema.projects.id, projectId))
            .returning({
              id: schema.projects.id,
              isActive: schema.projects.isActive,
            })

          if (!updatedProject || updatedProject.length === 0) {
            return status(500, "Failed to deactivate project")
          }

          set.status = 200
          return { message: `Project ${projectId} deactivated successfully` }
        } catch {
          return status(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          id: t.String({
            format: "uuid",
          }),
        }),
        detail: {
          summary: "Delete a project by ID",
          tags: ["Projects"],
        },
        adminOnly: true,
      }
    )
    // ACTIVATE Project
    .patch(
      "/id/:id/activate",
      async ({ db, params, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const projectId = params.id

        try {
          // Check if project exists
          const existingProject = await db.query.projects.findFirst({
            where: eq(schema.projects.id, projectId),
            columns: { id: true, isActive: true },
          })

          if (!existingProject) {
            return status(404, "Project not found")
          }

          if (existingProject.isActive) {
            return status(400, "Project is already active")
          }

          // Reactivate: set isActive to true
          const updatedProject = await db
            .update(schema.projects)
            .set({
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(schema.projects.id, projectId))
            .returning({
              id: schema.projects.id,
              isActive: schema.projects.isActive,
            })

          if (!updatedProject || updatedProject.length === 0) {
            return status(500, "Failed to activate project")
          }

          return {
            message: `Project ${projectId} activated successfully`,
            project: updatedProject[0],
          }
        } catch {
          return status(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          id: t.String({
            format: "uuid",
          }),
        }),
        detail: {
          summary: "Activate a project by ID",
          tags: ["Projects"],
        },
        adminOnly: true,
      }
    )
    // RECURRING BUDGET INJECTIONS
    // GET recurring budget injection for a project
    .get(
      "/id/:id/recurring-budget",
      async ({ db, params, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const projectId = params.id

        // Check if project exists
        const project = await db.query.projects.findFirst({
          where: eq(schema.projects.id, projectId),
          columns: { id: true, name: true },
        })

        if (!project) {
          return status(404, "Project not found")
        }

        // Get active recurring budget injection for this project
        const recurringBudget =
          await db.query.projectRecurringBudgetInjections.findFirst({
            where: and(
              eq(schema.projectRecurringBudgetInjections.projectId, projectId),
              eq(schema.projectRecurringBudgetInjections.isActive, true)
            ),
          })

        return {
          project,
          recurringBudget,
        }
      },
      {
        params: t.Object({
          id: t.String({ format: "uuid" }),
        }),
        detail: {
          summary: "Get recurring budget injection for a project",
          tags: ["Projects", "Recurring Budget"],
        },
        adminOnly: true,
      }
    )
    // CREATE recurring budget injection for a project
    .post(
      "/id/:id/recurring-budget",
      async ({ db, params, body, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const projectId = params.id

        // Check if project exists
        const project = await db.query.projects.findFirst({
          where: eq(schema.projects.id, projectId),
          columns: { id: true },
        })

        if (!project) {
          return status(404, "Project not found")
        }

        try {
          // Check if there's already an active recurring budget injection that hasn't ended
          const existingActive =
            await db.query.projectRecurringBudgetInjections.findFirst({
              where: and(
                eq(
                  schema.projectRecurringBudgetInjections.projectId,
                  projectId
                ),
                eq(schema.projectRecurringBudgetInjections.isActive, true)
              ),
            })

          if (existingActive) {
            // Check if the existing recurring budget has ended
            const today = dayjs().startOf("day")
            const existingEndDate = existingActive.endDate
              ? dayjs(existingActive.endDate).endOf("day")
              : null

            // If there's no end date, or if the end date hasn't passed yet, prevent creation
            if (
              !existingEndDate ||
              today.isBefore(existingEndDate) ||
              today.isSame(existingEndDate)
            ) {
              return status(
                400,
                "Project already has an active recurring budget injection that hasn't ended yet"
              )
            }
            // If the existing recurring budget has ended, we can create a new one
          }

          // Create new recurring budget injection
          const newRecurringBudget = await db
            .insert(schema.projectRecurringBudgetInjections)
            .values({
              projectId,
              amount: body.amount.toString(),
              frequency: body.frequency,
              startDate: body.startDate,
              endDate: body.endDate,
              description: body.description,
              isActive: true,
            })
            .returning()

          if (!newRecurringBudget || newRecurringBudget.length === 0) {
            return status(500, "Failed to create recurring budget injection")
          }

          // Create budget injections upfront
          // If endDate is provided: create all injections for the entire date range
          // If no endDate: only create injections up to current period, let cron handle future ones
          try {
            const freq = body.frequency
            const stepMonths =
              freq === "monthly" ? 1 : freq === "quarterly" ? 3 : 12
            let cursor = dayjs(body.startDate).startOf("day")

            // Determine the end point for injection creation
            let until: dayjs.Dayjs
            if (body.endDate) {
              // If end date is provided, create all injections for the entire range
              until = dayjs(body.endDate).endOf("day")
            } else {
              // If no end date, only create injections up to the current period
              const today = dayjs().startOf("day")
              if (freq === "monthly") {
                until = today.endOf("month")
              } else if (freq === "quarterly") {
                const currentQuarter = Math.floor(today.month() / 3)
                until = today
                  .month(currentQuarter * 3)
                  .endOf("month")
                  .add(2, "month")
              } else {
                // yearly
                until = today.endOf("year")
              }
            }

            const injectionsToCreate = []

            while (cursor.isSame(until) || cursor.isBefore(until)) {
              // Define a period window for duplicate detection
              let windowStart: dayjs.Dayjs
              let windowEnd: dayjs.Dayjs
              if (freq === "monthly") {
                windowStart = cursor.startOf("month")
                windowEnd = cursor.endOf("month")
              } else if (freq === "quarterly") {
                const quarterStartMonth = cursor.month() - (cursor.month() % 3)
                windowStart = cursor.month(quarterStartMonth).startOf("month")
                windowEnd = windowStart
                  .add(3, "month")
                  .subtract(1, "day")
                  .endOf("day")
              } else {
                windowStart = cursor.startOf("year")
                windowEnd = cursor.endOf("year")
              }

              const existing = await db.query.projectBudgetInjections.findFirst(
                {
                  where: and(
                    eq(schema.projectBudgetInjections.projectId, projectId),
                    gte(
                      schema.projectBudgetInjections.date,
                      windowStart.toDate()
                    ),
                    lte(
                      schema.projectBudgetInjections.date,
                      windowEnd.toDate()
                    ),
                    // Only consider existing recurring injections as duplicates.
                    ilike(
                      schema.projectBudgetInjections.description,
                      "%Recurring%injection%"
                    )
                  ),
                }
              )

              if (!existing) {
                injectionsToCreate.push({
                  projectId,
                  date: cursor.toDate(),
                  budget: body.amount.toString(),
                  description: `Recurring ${freq} injection: ${
                    body.description || "Auto-generated"
                  }`,
                })
              }

              cursor = cursor.add(stepMonths, "month")
            }

            // Batch insert all injections at once
            if (injectionsToCreate.length > 0) {
              await db
                .insert(schema.projectBudgetInjections)
                .values(injectionsToCreate)
              console.log(
                `✅ Created ${
                  injectionsToCreate.length
                } budget injections for project ${projectId}${
                  !body.endDate
                    ? " (up to current period, cron will handle future ones)"
                    : ""
                }`
              )
            }
          } catch (backfillError) {
            console.error(
              "Failed to create recurring budget injections:",
              backfillError
            )
            // Don't throw the error, just log it since the recurring budget record was already created
          }

          return newRecurringBudget[0]
        } catch (error) {
          console.error("Error creating recurring budget injection:", error)
          return status(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          id: t.String({ format: "uuid" }),
        }),
        body: t.Object({
          amount: t.Number({ minimum: 0.01 }),
          frequency: t.UnionEnum(["monthly", "quarterly", "yearly"]),
          startDate: t.String({ format: "date" }),
          endDate: t.Optional(t.String({ format: "date" })),
          description: t.Optional(t.String()),
        }),
        detail: {
          summary: "Create recurring budget injection for a project",
          tags: ["Projects", "Recurring Budget"],
        },
        adminOnly: true,
      }
    )
    // DISABLED: UPDATE recurring budget injection
    // This endpoint is disabled because recurring budgets now create all injections upfront.
    // To modify a recurring budget, users should stop the current one and create a new one.
    /*
    .put(
      "/recurring-budget/:injectionId",
      async ({ db, params, body, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const injectionId = params.injectionId

        // Check if recurring budget injection exists
        const existingInjection =
          await db.query.projectRecurringBudgetInjections.findFirst({
            where: eq(schema.projectRecurringBudgetInjections.id, injectionId),
          })

        if (!existingInjection) {
          return status(404, "Recurring budget injection not found")
        }

        try {
          const updatedInjection = await db
            .update(schema.projectRecurringBudgetInjections)
            .set({
              amount: body.amount.toString(),
              frequency: body.frequency,
              startDate: body.startDate,
              endDate: body.endDate,
              description: body.description,
              updatedAt: new Date(),
            })
            .where(eq(schema.projectRecurringBudgetInjections.id, injectionId))
            .returning()

          if (!updatedInjection || updatedInjection.length === 0) {
            return status(500, "Failed to update recurring budget injection")
          }

          return updatedInjection[0]
        } catch (error) {
          console.error("Error updating recurring budget injection:", error)
          return status(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          injectionId: t.String({ format: "uuid" }),
        }),
        body: t.Object({
          amount: t.Number({ minimum: 0.01 }),
          frequency: t.UnionEnum(["monthly", "quarterly", "yearly"]),
          startDate: t.String({ format: "date" }),
          endDate: t.Optional(t.String({ format: "date" })),
          description: t.Optional(t.String()),
        }),
        detail: {
          summary: "Update recurring budget injection",
          tags: ["Projects", "Recurring Budget"],
        },
        adminOnly: true,
      }
    )
    */
    // DEACTIVATE recurring budget injection
    .patch(
      "/recurring-budget/:injectionId/deactivate",
      async ({ db, params, status, isAdmin }) => {
        if (!isAdmin) {
          return status(403, "Forbidden")
        }

        const injectionId = params.injectionId

        // Check if recurring budget injection exists and is active
        const existingInjection =
          await db.query.projectRecurringBudgetInjections.findFirst({
            where: eq(schema.projectRecurringBudgetInjections.id, injectionId),
            columns: { id: true, isActive: true },
          })

        if (!existingInjection) {
          return status(404, "Recurring budget injection not found")
        }

        if (!existingInjection.isActive) {
          return status(400, "Recurring budget injection is already inactive")
        }

        try {
          const updatedInjection = await db
            .update(schema.projectRecurringBudgetInjections)
            .set({
              isActive: false,
              updatedAt: new Date(),
            })
            .where(eq(schema.projectRecurringBudgetInjections.id, injectionId))
            .returning({
              id: schema.projectRecurringBudgetInjections.id,
              isActive: schema.projectRecurringBudgetInjections.isActive,
            })

          if (!updatedInjection || updatedInjection.length === 0) {
            return status(
              500,
              "Failed to deactivate recurring budget injection"
            )
          }

          return {
            message: `Recurring budget injection ${injectionId} deactivated successfully`,
            injection: updatedInjection[0],
          }
        } catch (error) {
          console.error("Error deactivating recurring budget injection:", error)
          return status(500, "Internal Server Error")
        }
      },
      {
        params: t.Object({
          injectionId: t.String({ format: "uuid" }),
        }),
        detail: {
          summary: "Deactivate recurring budget injection",
          tags: ["Projects", "Recurring Budget"],
        },
        adminOnly: true,
      }
    )
)
