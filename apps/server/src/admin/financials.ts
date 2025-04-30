import { Decimal } from "decimal.js" // For precise calculations with numeric types
import { asc, eq } from "drizzle-orm"
import { error, t } from "elysia"
import { error as logError } from "@rasla/logify"
import { baseApp } from "../../utils/baseApp"
import {
  projectBudgetInjections,
  projects,
  timeEntries,
  users,
} from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { UUID } from "../../utils/validtors"

// Helper function to format date to YYYY-MM
const formatToYearMonth = (date: Date): string => {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  return `${year}-${month}`
}

// Use baseApp and apply authGuard
export const adminFinancials = baseApp("adminFinancials").group(
  "/admin/financials",
  (app) =>
    app
      .use(authGuard("admin"))
      // GET Project Financial Overview
      .get(
        "/:projectId",
        async ({ params, db }) => {
          const { projectId } = params

          // 1. Fetch Project Details
          const projectDetails = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
            columns: {
              id: true,
              name: true,
            },
          })

          if (!projectDetails) {
            throw error(404, "Project not found")
          }

          // 2. Fetch Budget Injections
          const budgetInjectionsData =
            await db.query.projectBudgetInjections.findMany({
              where: eq(projectBudgetInjections.projectId, projectId),
              columns: {
                id: true,
                budget: true, // numeric type
                description: true,
                createdAt: true, // use createdAt for the 'date' field?
              },
              orderBy: [asc(projectBudgetInjections.createdAt)],
            })

          // Format budget injections for the frontend
          const formattedBudgetInjections = budgetInjectionsData.map(
            (b: (typeof budgetInjectionsData)[number]) => ({
              id: b.id,
              amount: new Decimal(b.budget).toNumber(),
              date: formatToYearMonth(b.createdAt),
              description: b.description ?? "",
            })
          )

          // 3. Fetch Time Entries with User Rate
          const entriesWithRate = await db
            .select({
              startTime: timeEntries.startTime,
              durationSeconds: timeEntries.durationSeconds,
              ratePerHour: users.ratePerHour, // numeric type
            })
            .from(timeEntries)
            .innerJoin(users, eq(timeEntries.userId, users.id))
            .where(eq(timeEntries.projectId, projectId))

          // 4. Calculate Cost Over Time
          const monthlyCosts: Record<string, Decimal> = {} // Use Decimal for aggregation

          for (const entry of entriesWithRate) {
            const month = formatToYearMonth(entry.startTime)
            const rate = new Decimal(entry.ratePerHour)
            const durationHours = new Decimal(entry.durationSeconds).div(3600)
            const cost = rate.mul(durationHours)

            if (!monthlyCosts[month]) {
              monthlyCosts[month] = new Decimal(0)
            }
            monthlyCosts[month] = monthlyCosts[month].add(cost)
          }

          // Format costOverTime for the frontend
          const costOverTime = Object.entries(monthlyCosts)
            .map(([month, totalCost]) => ({
              month,
              cost: totalCost.toDecimalPlaces(2).toNumber(), // Convert final sum to number
            }))
            .sort((a, b) => a.month.localeCompare(b.month)) // Ensure chronological order

          // 5. Structure Response
          return {
            projectId: projectDetails.id,
            projectName: projectDetails.name,
            budgetInjections: formattedBudgetInjections,
            costOverTime,
          }
        },
        {
          params: t.Object({
            projectId: UUID,
          }),
          detail: {
            summary: "Get financial overview for a specific project (Admin)",
            tags: ["Admin", "Financials"],
          },
        }
      )
      // PUT Update Budget Injection
      .put(
        "/budget-injection/:injectionId",
        async ({ params, body, db }) => {
          const { injectionId } = params
          const { amount, description } = body

          // Validate amount is positive
          if (amount <= 0) {
            throw error(400, "Budget amount must be positive.")
          }

          // Convert amount to Decimal for precision before storing
          const budgetDecimal = new Decimal(amount)

          try {
            const updatedInjection = await db
              .update(projectBudgetInjections)
              .set({
                budget: budgetDecimal.toFixed(), // Store as string/numeric representation
                description: description,
                // Add updatedAt timestamp if you have one
              })
              .where(eq(projectBudgetInjections.id, injectionId))
              .returning({
                id: projectBudgetInjections.id,
                projectId: projectBudgetInjections.projectId,
                budget: projectBudgetInjections.budget,
                description: projectBudgetInjections.description,
                createdAt: projectBudgetInjections.createdAt,
              }) // Return the updated record

            if (updatedInjection.length === 0) {
              throw error(404, "Budget injection not found.")
            }

            // Format the returned budget back to a number for the response
            return {
              ...updatedInjection[0],
              budget: new Decimal(updatedInjection[0].budget).toNumber(),
            }
          } catch (e: any) {
            // Handle potential database errors or not found errors
            if (e.status === 404) throw e
            logError(`Error updating budget injection: ${e}`)
            throw error(500, `Failed to update budget injection: ${e.message}`)
          }
        },
        {
          params: t.Object({
            injectionId: UUID, // Assuming injection IDs are UUIDs like project IDs
          }),
          body: t.Object({
            amount: t.Number({ minimum: 0.01 }), // Ensure positive amount
            description: t.Optional(t.String()), // Description is optional
          }),
          detail: {
            summary: "Update an existing budget injection (Admin)",
            tags: ["Admin", "Financials"],
          },
        }
      )
      // DELETE Budget Injection
      .delete(
        "/budget-injection/:injectionId",
        async ({ params, db }) => {
          const { injectionId } = params

          try {
            const deletedInjection = await db
              .delete(projectBudgetInjections)
              .where(eq(projectBudgetInjections.id, injectionId))
              .returning({ id: projectBudgetInjections.id })

            if (deletedInjection.length === 0) {
              throw error(404, "Budget injection not found.")
            }

            return { success: true, deletedId: deletedInjection[0].id }
          } catch (e: any) {
            if (e.status === 404) throw e
            logError(`Error deleting budget injection: ${e}`)
            throw error(500, `Failed to delete budget injection: ${e.message}`)
          }
        },
        {
          params: t.Object({
            injectionId: UUID,
          }),
          detail: {
            summary: "Delete a budget injection (Admin)",
            tags: ["Admin", "Financials"],
          },
        }
      )
      // POST Create Budget Injection
      .post(
        "/budget-injection/:projectId",
        async ({ params, body, db }) => {
          const { projectId } = params
          const { amount, description } = body

          // Optional: Check if project exists first
          const projectExists = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
            columns: { id: true },
          })
          if (!projectExists) {
            throw error(404, "Project not found.")
          }

          // Validate amount is positive
          if (amount <= 0) {
            throw error(400, "Budget amount must be positive.")
          }

          const budgetDecimal = new Decimal(amount)

          try {
            const newInjection = await db
              .insert(projectBudgetInjections)
              .values({
                projectId: projectId,
                budget: budgetDecimal.toFixed(), // Store precise value
                description: description,
              })
              .returning({
                id: projectBudgetInjections.id,
                projectId: projectBudgetInjections.projectId,
                budget: projectBudgetInjections.budget,
                description: projectBudgetInjections.description,
                createdAt: projectBudgetInjections.createdAt,
              })

            if (newInjection.length === 0) {
              // This case is unlikely with insert but good practice
              throw error(500, "Failed to create budget injection.")
            }

            // Format the returned budget back to a number for the response
            return {
              ...newInjection[0],
              budget: new Decimal(newInjection[0].budget).toNumber(),
            }
          } catch (e: any) {
            logError(`Error creating budget injection: ${e}`)
            throw error(500, `Failed to create budget injection: ${e.message}`)
          }
        },
        {
          params: t.Object({
            projectId: UUID,
          }),
          body: t.Object({
            amount: t.Number({ minimum: 0.01 }),
            description: t.Optional(t.String()),
          }),
          detail: {
            summary: "Create a new budget injection for a project (Admin)",
            tags: ["Admin", "Financials"],
          },
        }
      )
)
