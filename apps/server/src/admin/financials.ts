import { Decimal } from "decimal.js" // For precise calculations with numeric types
import { asc, eq, and, gte, lt } from "drizzle-orm"
import { t } from "elysia"
import { baseApp } from "../../utils/baseApp"
import {
  projectBudgetInjections,
  projects,
  timeEntries,
  users,
  departments as departmentsTable,
  projectRecurringBudgetInjections,
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

          // 3. Fetch Time Entries with Historical Rate
          const entriesWithRate = await db
            .select({
              date: timeEntries.date,
              durationSeconds: timeEntries.durationSeconds,
              ratePerHour: timeEntries.ratePerHour, // Use historical rate from time entry
            })
            .from(timeEntries)
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
      // GET Monthly Breakdown
      .get(
        "/:projectId/monthly-breakdown",
        async ({ params, query, db, status }) => {
          const { projectId } = params
          const { year, month } = query

          // Validate year and month
          if (!year || !month) {
            return status(400, "Year and month are required")
          }

          const yearNum = parseInt(year as string)
          const monthNum = parseInt(month as string)

          if (
            yearNum < 2020 ||
            yearNum > 2030 ||
            monthNum < 1 ||
            monthNum > 12
          ) {
            return status(400, "Invalid year or month")
          }

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

          // 2. Get Monthly Budget Injection (Retainer Fee) from Recurring Budget
          const recurringBudgetInjection =
            await db.query.projectRecurringBudgetInjections.findFirst({
              where: and(
                eq(projectRecurringBudgetInjections.projectId, projectId),
                eq(projectRecurringBudgetInjections.isActive, true)
              ),
              columns: {
                amount: true,
                frequency: true,
                startDate: true,
                endDate: true,
              },
            })

          let retainerFee = 0
          if (recurringBudgetInjection) {
            const { amount, frequency, startDate, endDate } =
              recurringBudgetInjection
            const startDateObj = new Date(startDate)
            const endDateObj = endDate ? new Date(endDate) : null
            const currentMonthStart = new Date(yearNum, monthNum - 1, 1)
            const currentMonthEnd = new Date(yearNum, monthNum, 1)

            // Check if the recurring budget is active for this month
            if (
              startDateObj <= currentMonthEnd &&
              (!endDateObj || endDateObj >= currentMonthStart)
            ) {
              // Calculate the amount for this specific month based on frequency
              const monthlyAmount = new Decimal(amount)

              if (frequency === "monthly") {
                retainerFee = monthlyAmount.toNumber()
              } else if (frequency === "quarterly") {
                retainerFee = monthlyAmount.div(3).toNumber()
              } else if (frequency === "yearly") {
                retainerFee = monthlyAmount.div(12).toNumber()
              }
            }
          }

          // 3. Fetch Time Entries for the Month with User and Department Info
          const timeEntriesWithUsers = await db
            .select({
              id: timeEntries.id,
              description: timeEntries.description,
              date: timeEntries.date,
              durationSeconds: timeEntries.durationSeconds,
              ratePerHour: timeEntries.ratePerHour,
              userId: timeEntries.userId,
              userName: users.email,
              userRatePerHour: users.ratePerHour,
              departmentId: users.departmentId,
              departmentName: departmentsTable.name,
              departmentColor: departmentsTable.color,
            })
            .from(timeEntries)
            .innerJoin(users, eq(timeEntries.userId, users.id))
            .innerJoin(
              departmentsTable,
              eq(users.departmentId, departmentsTable.id)
            )
            .where(
              and(
                eq(timeEntries.projectId, projectId),
                gte(
                  timeEntries.date,
                  `${yearNum}-${monthNum.toString().padStart(2, "0")}-01`
                ),
                lt(
                  timeEntries.date,
                  `${yearNum}-${(monthNum + 1).toString().padStart(2, "0")}-01`
                )
              )
            )

          // 4. Helper function to get week number
          const getWeekNumber = (dateString: string): number => {
            const date = new Date(dateString)
            const dayOfMonth = date.getDate()
            if (dayOfMonth <= 7) return 1
            if (dayOfMonth <= 14) return 2
            if (dayOfMonth <= 21) return 3
            if (dayOfMonth <= 28) return 4
            return 5
          }

          // 5. Process and group data
          const departmentMap = new Map()
          let totalSpend = 0

          for (const entry of timeEntriesWithUsers) {
            const cost = new Decimal(entry.ratePerHour)
              .mul(entry.durationSeconds)
              .div(3600)
            const hours = new Decimal(entry.durationSeconds).div(3600)
            const weekNumber = getWeekNumber(entry.date)

            totalSpend += cost.toNumber()

            // Initialize department if not exists
            if (!departmentMap.has(entry.departmentId)) {
              departmentMap.set(entry.departmentId, {
                id: entry.departmentId,
                name: entry.departmentName,
                color: entry.departmentColor,
                totalHours: 0,
                totalSpend: 0,
                users: new Map(),
              })
            }

            const department = departmentMap.get(entry.departmentId)

            // Initialize user if not exists
            if (!department.users.has(entry.userId)) {
              department.users.set(entry.userId, {
                id: entry.userId,
                name: entry.userName,
                ratePerHour: entry.userRatePerHour,
                totalHours: 0,
                totalSpend: 0,
                weeklyHours: [0, 0, 0, 0, 0],
                timeEntries: [],
              })
            }

            const user = department.users.get(entry.userId)

            // Update user totals
            user.totalHours += hours.toNumber()
            user.totalSpend += cost.toNumber()
            user.weeklyHours[weekNumber - 1] += hours.toNumber()

            // Add time entry
            user.timeEntries.push({
              id: entry.id,
              description: entry.description,
              date: entry.date,
              durationSeconds: entry.durationSeconds,
              cost: cost.toNumber(),
              weekNumber,
            })

            // Update department totals
            department.totalHours += hours.toNumber()
            department.totalSpend += cost.toNumber()
          }

          // 6. Convert maps to arrays and calculate percentages
          const departments = Array.from(departmentMap.values()).map(
            (dept) => ({
              ...dept,
              users: Array.from(dept.users.values()),
            })
          )

          const leftover = retainerFee - totalSpend
          const usedPercentage =
            retainerFee > 0 ? Math.round((totalSpend / retainerFee) * 100) : 0
          const remainingPercentage =
            retainerFee > 0 ? Math.round((leftover / retainerFee) * 100) : 0

          // 7. Structure Response
          return {
            project: {
              id: projectDetails.id,
              name: projectDetails.name,
            },
            monthData: {
              year: yearNum,
              month: monthNum,
              retainerFee,
              totalSpend,
              leftover,
              usedPercentage,
              remainingPercentage,
            },
            departments,
          }
        },
        {
          params: t.Object({
            projectId: UUID,
          }),
          query: t.Object({
            year: t.String(),
            month: t.String(),
          }),
          detail: {
            summary: "Get monthly breakdown for a project (Admin)",
            tags: ["Admin", "Financials", "Monthly Breakdown"],
          },
        }
      )
)
