import { Decimal } from "decimal.js" // For precise calculations with numeric types
import { asc, eq } from "drizzle-orm"
import { t } from "elysia"
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
  const year = new Date(date).getFullYear()
  const month = (new Date(date).getMonth() + 1).toString().padStart(2, "0")
  return `${year}-${month}`
}

export const adminFinancials = baseApp("adminFinancials").group(
  "/admin/financials",
  (app) =>
    app
      .use(authGuard("admin"))
      // GET Project Financial Overview
      .get(
        "/:projectId",
        async ({ params, db, status }) => {
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
            return status(404, "Project not found")
          }

          // 2. Fetch Budget Injections
          const budgetInjectionsData =
            await db.query.projectBudgetInjections.findMany({
              where: eq(projectBudgetInjections.projectId, projectId),
              columns: {
                id: true,
                budget: true, // numeric type
                description: true,
                date: true, // use createdAt for the 'date' field?
              },
              orderBy: [asc(projectBudgetInjections.createdAt)],
            })

          // Format budget injections for the frontend
          const formattedBudgetInjections = budgetInjectionsData.map(
            (b: (typeof budgetInjectionsData)[number]) => ({
              id: b.id,
              amount: new Decimal(b.budget).toNumber(),
              date: b.date,
              description: b.description ?? "",
            })
          )

          // 3. Fetch Time Entries with User Rate
          const entriesWithRate = await db
            .select({
              date: timeEntries.date,
              durationSeconds: timeEntries.durationSeconds,
              ratePerHour: users.ratePerHour, // numeric type
            })
            .from(timeEntries)
            .innerJoin(users, eq(timeEntries.userId, users.id))
            .where(eq(timeEntries.projectId, projectId))

          // 4. Calculate Cost Over Time
          const monthlyCosts: Record<string, Decimal> = {} // Use Decimal for aggregation

          for (const entry of entriesWithRate) {
            const month = formatToYearMonth(new Date(entry.date))
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
        async ({ params, body, db, status }) => {
          const { injectionId } = params
          const { amount, description, date } = body

          const updateObj: {
            budget?: string
            description?: string
            date?: Date
          } = {}

          if (amount) {
            updateObj.budget = new Decimal(amount).toFixed()
          }

          if (date) {
            updateObj.date = date
          }

          if (description) {
            updateObj.description = description
          }

          try {
            const updatedInjection = await db
              .update(projectBudgetInjections)
              .set(updateObj)
              .where(eq(projectBudgetInjections.id, injectionId))
              .returning({
                id: projectBudgetInjections.id,
                projectId: projectBudgetInjections.projectId,
                budget: projectBudgetInjections.budget,
                description: projectBudgetInjections.description,
                createdAt: projectBudgetInjections.createdAt,
              }) // Return the updated record

            if (updatedInjection.length === 0) {
              return status(404, "Budget injection not found.")
            }

            // Format the returned budget back to a number for the response
            return {
              ...updatedInjection[0],
              budget: new Decimal(updatedInjection[0].budget).toNumber(),
            }
          } catch (e: any) {
            // Handle potential database errors or not found errors
            if (e.status === 404) throw e
            return status(
              500,
              `Failed to update budget injection: ${e.message}`
            )
          }
        },
        {
          params: t.Object({
            injectionId: UUID, // Assuming injection IDs are UUIDs like project IDs
          }),
          body: t.Object({
            amount: t.Optional(t.Number({ minimum: 0.01 })), // Ensure positive amount
            date: t.Optional(t.Date()),
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
        async ({ params, db, status }) => {
          const { injectionId } = params

          try {
            const deletedInjection = await db
              .delete(projectBudgetInjections)
              .where(eq(projectBudgetInjections.id, injectionId))
              .returning({ id: projectBudgetInjections.id })

            if (deletedInjection.length === 0) {
              return status(404, "Budget injection not found.")
            }

            return { success: true, deletedId: deletedInjection[0].id }
          } catch (e: any) {
            if (e.status === 404) throw e
            return status(
              500,
              `Failed to delete budget injection: ${e.message}`
            )
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
        "/budget-injection/new/:projectId",
        async ({ params, body, db, status }) => {
          const { projectId } = params
          const { amount, description, date } = body

          // Optional: Check if project exists first
          const projectExists = await db.query.projects.findFirst({
            where: eq(projects.id, projectId),
            columns: { id: true },
          })
          if (!projectExists) {
            return status(404, "Project not found.")
          }

          // Validate amount is positive
          if (amount <= 0) {
            return status(400, "Budget amount must be positive.")
          }

          const budgetDecimal = new Decimal(amount)

          try {
            const newInjection = await db
              .insert(projectBudgetInjections)
              .values({
                projectId,
                date,
                budget: budgetDecimal.toFixed(),
                description,
              })
              .returning({
                id: projectBudgetInjections.id,
                projectId: projectBudgetInjections.projectId,
                date: projectBudgetInjections.date,
                budget: projectBudgetInjections.budget,
                description: projectBudgetInjections.description,
              })

            if (newInjection.length === 0) {
              // This case is unlikely with insert but good practice
              return status(500, "Failed to create budget injection.")
            }

            // Format the returned budget back to a number for the response
            return {
              ...newInjection[0],
              budget: new Decimal(newInjection[0].budget).toNumber(),
            }
          } catch (e: any) {
            return status(
              500,
              `Failed to create budget injection: ${e.message}`
            )
          }
        },
        {
          params: t.Object({
            projectId: UUID,
          }),
          body: t.Object({
            amount: t.Number({ minimum: 0.01 }),
            date: t.Date(),
            description: t.Optional(t.String()),
          }),
          detail: {
            summary: "Create a new budget injection for a project (Admin)",
            tags: ["Admin", "Financials"],
          },
        }
      )
)
