import { Decimal } from "decimal.js" // For precise calculations with numeric types
import { asc, eq, and, gte, lt, lte } from "drizzle-orm"
import { t, status } from "elysia"
import { baseApp } from "../../utils/baseApp"
import {
  projectBudgetInjections,
  projects,
  timeEntries,
  users,
  departments as departmentsTable,
  projectRecurringBudgetInjections,
  projectDepartmentBudgetSplits,
} from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { UUID } from "../../utils/validators"

// TypeScript interfaces for financial data structures
interface ProjectUserRecord {
  team: string
  project: string
  week1: number
  week2: number
  week3: number
  week4: number
  week5: number
  totalHours: number
  decimalHours: number
  cost: number
}

interface ProjectData {
  projectName: string
  projectId: string
  users: Map<string, ProjectUserRecord>
  totalHours: number
  totalCost: number
  revenue: number
}

interface MonthlyBreakdownUser {
  id: string
  name: string
  ratePerHour: string
  totalHours: number
  totalSpend: number
  weeklyHours: number[]
  timeEntries: Array<{
    id: string
    description: string | null
    date: string
    durationSeconds: number
    cost: number
    weekNumber: number
  }>
}

interface MonthlyBreakdownDepartment {
  id: string
  name: string
  color: string
  totalHours: number
  totalSpend: number
  users: Map<string, MonthlyBreakdownUser>
}

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
      // GET General Financial Overview
      .get(
        "/",
        async ({ query, db }) => {
          const { startDate, endDate, projectId } = query

          // Build filters
          const filters = []
          if (startDate) {
            filters.push(gte(timeEntries.date, startDate))
          }
          if (endDate) {
            filters.push(lte(timeEntries.date, endDate))
          }
          if (projectId) {
            filters.push(eq(timeEntries.projectId, projectId))
          }

          const whereCondition =
            filters.length > 0 ? and(...filters) : undefined

          // Fetch time entries with user and project info
          const timeEntriesWithUsers = await db
            .select({
              id: timeEntries.id,
              date: timeEntries.date,
              durationSeconds: timeEntries.durationSeconds,
              ratePerHour: timeEntries.ratePerHour,
              userId: timeEntries.userId,
              userName: users.email,
              projectId: timeEntries.projectId,
              projectName: projects.name,
            })
            .from(timeEntries)
            .innerJoin(users, eq(timeEntries.userId, users.id))
            .innerJoin(projects, eq(timeEntries.projectId, projects.id))
            .$dynamic()
            .where(whereCondition)
            .orderBy(asc(timeEntries.date))

          // Fetch target projects (active), optionally filtered by projectId
          const targetProjects = await db.query.projects.findMany({
            where: projectId
              ? and(eq(projects.id, projectId), eq(projects.isActive, true))
              : eq(projects.isActive, true),
            columns: { id: true, name: true },
          })

          // Fetch budget injections for all projects
          const budgetInjections =
            await db.query.projectBudgetInjections.findMany({
              columns: {
                projectId: true,
                budget: true,
                date: true,
              },
            })

          // Create a map of project budgets
          const projectBudgets = new Map<string, Decimal>() // lifetime budgets (for revenue)
          const projectBudgetsToDate = new Map<string, Decimal>() // budgets up to endDate (overall budget to date)
          const cutoffBudgetDate = endDate
            ? new Date(`${endDate}T23:59:59.999Z`)
            : null
          for (const injection of budgetInjections) {
            const currentBudget =
              projectBudgets.get(injection.projectId) || new Decimal(0)
            projectBudgets.set(
              injection.projectId,
              currentBudget.add(new Decimal(injection.budget))
            )
            // Also aggregate budgets up to endDate when provided
            if (!cutoffBudgetDate || injection.date <= cutoffBudgetDate) {
              const currentToDate =
                projectBudgetsToDate.get(injection.projectId) || new Decimal(0)
              projectBudgetsToDate.set(
                injection.projectId,
                currentToDate.add(new Decimal(injection.budget))
              )
            }
          }

          // Build spend-to-date map (sum of entry costs up to endDate)
          const spendToDateFilters = [] as unknown[]
          if (endDate) {
            spendToDateFilters.push(lte(timeEntries.date, endDate as string))
          }

          const entriesUpToCutoff = await db
            .select({
              projectId: timeEntries.projectId,
              date: timeEntries.date,
              durationSeconds: timeEntries.durationSeconds,
              ratePerHour: timeEntries.ratePerHour,
            })
            .from(timeEntries)
            .$dynamic()
            .where(
              spendToDateFilters.length > 0
                ? and(...(spendToDateFilters as [any, ...any[]]))
                : undefined
            )

          const spendToDateByProjectId = new Map<string, Decimal>()
          for (const entry of entriesUpToCutoff) {
            const rate = new Decimal(entry.ratePerHour)
            const hours = new Decimal(entry.durationSeconds).div(3600)
            const cost = rate.mul(hours)
            const current =
              spendToDateByProjectId.get(entry.projectId) || new Decimal(0)
            spendToDateByProjectId.set(entry.projectId, current.add(cost))
          }

          // Helper function to get week number
          const getWeekNumber = (dateString: string): number => {
            const date = new Date(dateString)
            const dayOfMonth = date.getDate()
            if (dayOfMonth <= 7) return 1
            if (dayOfMonth <= 14) return 2
            if (dayOfMonth <= 21) return 3
            if (dayOfMonth <= 28) return 4
            return 5
          }

          // Process data into the required format - group by project, then by user
          const projectMap = new Map<string, ProjectData>()

          // Seed all target projects so projects without time entries still appear
          for (const p of targetProjects) {
            const seededBudget = projectBudgets.get(p.id) || new Decimal(0)
            if (!projectMap.has(p.name)) {
              projectMap.set(p.name, {
                projectName: p.name,
                projectId: p.id,
                users: new Map<string, ProjectUserRecord>(),
                totalHours: 0,
                totalCost: 0,
                revenue: seededBudget.toNumber(),
              })
            }
          }

          for (const entry of timeEntriesWithUsers) {
            const cost = new Decimal(entry.ratePerHour)
              .mul(entry.durationSeconds)
              .div(3600)
            const hours = new Decimal(entry.durationSeconds).div(3600)
            const weekNumber = getWeekNumber(entry.date)

            // Group by project first
            if (!projectMap.has(entry.projectName)) {
              const projectBudget =
                projectBudgets.get(entry.projectId) || new Decimal(0)
              projectMap.set(entry.projectName, {
                projectName: entry.projectName,
                projectId: entry.projectId,
                users: new Map<string, ProjectUserRecord>(),
                totalHours: 0,
                totalCost: 0,
                revenue: projectBudget.toNumber(),
              })
            }

            const project = projectMap.get(entry.projectName)!
            project.totalHours += hours.toNumber()
            project.totalCost += cost.toNumber()

            // Group users within each project
            if (!project.users.has(entry.userName)) {
              project.users.set(entry.userName, {
                team: entry.userName,
                project: entry.projectName,
                week1: 0,
                week2: 0,
                week3: 0,
                week4: 0,
                week5: 0,
                totalHours: 0,
                decimalHours: 0,
                cost: 0,
              })
            }

            const userRecord = project.users.get(entry.userName)!
            userRecord.totalHours += hours.toNumber()
            userRecord.decimalHours += hours.toNumber()
            userRecord.cost += cost.toNumber()
            userRecord[
              `week${weekNumber}` as keyof Pick<
                ProjectUserRecord,
                "week1" | "week2" | "week3" | "week4" | "week5"
              >
            ] += hours.toNumber()
          }

          // Convert projects to array format with formatted user records and per-project financials
          const projectData = Array.from(projectMap.values()).map(
            (project: ProjectData) => {
              const userRecords = Array.from(project.users.values()).map(
                (userRecord: ProjectUserRecord) => ({
                  ...userRecord,
                  week1:
                    userRecord.week1 > 0
                      ? `${Math.floor(userRecord.week1)}h ${Math.round(
                          (userRecord.week1 % 1) * 60
                        )}m`
                      : "-",
                  week2:
                    userRecord.week2 > 0
                      ? `${Math.floor(userRecord.week2)}h ${Math.round(
                          (userRecord.week2 % 1) * 60
                        )}m`
                      : "-",
                  week3:
                    userRecord.week3 > 0
                      ? `${Math.floor(userRecord.week3)}h ${Math.round(
                          (userRecord.week3 % 1) * 60
                        )}m`
                      : "-",
                  week4:
                    userRecord.week4 > 0
                      ? `${Math.floor(userRecord.week4)}h ${Math.round(
                          (userRecord.week4 % 1) * 60
                        )}m`
                      : "-",
                  week5:
                    userRecord.week5 > 0
                      ? `${Math.floor(userRecord.week5)}h ${Math.round(
                          (userRecord.week5 % 1) * 60
                        )}m`
                      : "-",
                  totalHours: `${Math.floor(
                    userRecord.totalHours
                  )}h ${Math.round((userRecord.totalHours % 1) * 60)}m`,
                  decimalHours: userRecord.decimalHours.toFixed(2),
                  cost: userRecord.cost.toFixed(2),
                })
              )

              // Calculate per-project financial metrics
              const revenue = project.revenue
              const cost = project.totalCost
              const profit = revenue - cost
              const usedPercentage =
                revenue > 0 ? Math.round((cost / revenue) * 100) : 0
              const marginsPercentage =
                revenue > 0 ? Math.round((profit / revenue) * 100) : 0

              const totalBudgetToDate =
                projectBudgetsToDate.get(project.projectId) || new Decimal(0)
              const totalSpendToDate =
                spendToDateByProjectId.get(project.projectId) || new Decimal(0)
              const leftoverToDate = totalBudgetToDate.sub(totalSpendToDate)
              const usedToDatePct = totalBudgetToDate.gt(0)
                ? Math.round(
                    totalSpendToDate.div(totalBudgetToDate).mul(100).toNumber()
                  )
                : 0

              return {
                projectName: project.projectName,
                projectId: project.projectId,
                users: userRecords,
                totalHours: `${Math.floor(project.totalHours)}h ${Math.round(
                  (project.totalHours % 1) * 60
                )}m`,
                totalCost: project.totalCost.toFixed(2),
                revenue: revenue.toFixed(2),
                profit: profit.toFixed(2),
                usedPercentage: `${usedPercentage}%`,
                marginsPercentage: `${marginsPercentage}%`,
                overallProjectData: {
                  totalBudget: totalBudgetToDate.toDecimalPlaces(2).toNumber(),
                  totalSpendToDate: totalSpendToDate
                    .toDecimalPlaces(2)
                    .toNumber(),
                  leftoverToDate: leftoverToDate.toDecimalPlaces(2).toNumber(),
                  usedPercentageToDate: usedToDatePct,
                  periodSpend: project.totalCost.toFixed(2),
                },
              }
            }
          )

          return {
            projects: projectData,
            summary: {
              revenue: "0.00",
              profit: "0.00",
              usedPercentage: "0%",
              marginsPercentage: "0%",
            },
          }
        },
        {
          query: t.Object({
            startDate: t.Optional(t.String()),
            endDate: t.Optional(t.String()),
            projectId: t.Optional(UUID),
          }),
          detail: {
            summary: "Get general financial overview (Admin)",
            tags: ["Admin", "Financials"],
          },
        }
      )
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
              budget: new Decimal(
                updatedInjection[0]?.budget ?? "0"
              ).toNumber(),
            }
          } catch (e: unknown) {
            // Handle potential database errors or not found errors
            if (e && typeof e === "object" && "status" in e && e.status === 404)
              throw e
            const errorMessage =
              e instanceof Error ? e.message : "Unknown error occurred"
            return status(
              500,
              `Failed to update budget injection: ${errorMessage}`
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

            return {
              success: true,
              deletedId: deletedInjection[0]?.id,
            }
          } catch (e: unknown) {
            if (e && typeof e === "object" && "status" in e && e.status === 404)
              throw e
            const errorMessage =
              e instanceof Error ? e.message : "Unknown error occurred"
            return status(
              500,
              `Failed to delete budget injection: ${errorMessage}`
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
              budget: new Decimal(newInjection[0]?.budget ?? "0").toNumber(),
            }
          } catch (e: unknown) {
            const errorMessage =
              e instanceof Error ? e.message : "Unknown error occurred"
            return status(
              500,
              `Failed to create budget injection: ${errorMessage}`
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

          let totalRetainerFee = 0
          if (recurringBudgetInjection) {
            const { amount, frequency, startDate, endDate } =
              recurringBudgetInjection
            const startDateObj = new Date(startDate)
            const endDateObj = endDate ? new Date(endDate) : null
            const currentMonthStart = new Date(yearNum, monthNum - 1, 1)
            const currentMonthEnd = new Date(yearNum, monthNum, 1)
            const today = new Date()

            // Check if the recurring budget is active for this month AND hasn't ended
            const isActiveForMonth =
              startDateObj <= currentMonthEnd &&
              (!endDateObj || endDateObj >= currentMonthStart)

            const hasNotEnded = !endDateObj || endDateObj >= today

            if (isActiveForMonth && hasNotEnded) {
              // Calculate the amount for this specific month based on frequency
              const monthlyAmount = new Decimal(amount)

              if (frequency === "monthly") {
                totalRetainerFee = monthlyAmount.toNumber()
              } else if (frequency === "quarterly") {
                totalRetainerFee = monthlyAmount.div(3).toNumber()
              } else if (frequency === "yearly") {
                totalRetainerFee = monthlyAmount.div(12).toNumber()
              }
            }
          }

          // 2.5. Get Department Budget Splits
          const departmentSplits = await db
            .select({
              departmentId: projectDepartmentBudgetSplits.departmentId,
              budgetAmount: projectDepartmentBudgetSplits.budgetAmount,
            })
            .from(projectDepartmentBudgetSplits)
            .where(eq(projectDepartmentBudgetSplits.projectId, projectId))

          // Calculate department-specific retainer fees
          const departmentRetainerFees = new Map<string, number>()

          for (const split of departmentSplits) {
            const amount = new Decimal(split.budgetAmount).toNumber()
            departmentRetainerFees.set(split.departmentId, amount)
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

          // Compute next month start for to-date aggregations
          const nextMonthStartIso = `${yearNum}-${(monthNum + 1)
            .toString()
            .padStart(2, "0")}-01`

          // 3.5. Compute Overall Project metrics up to the selected month
          // Sum all budget injections for the project with date before the next month start
          const allBudgetInjectionsForProject = await db
            .select({
              budget: projectBudgetInjections.budget,
              date: projectBudgetInjections.date,
            })
            .from(projectBudgetInjections)
            .where(
              and(
                eq(projectBudgetInjections.projectId, projectId),
                lt(projectBudgetInjections.date, new Date(nextMonthStartIso))
              )
            )

          const totalBudgetToDateDecimal = allBudgetInjectionsForProject.reduce(
            (sum, b) => sum.add(new Decimal(b.budget)),
            new Decimal(0)
          )

          // Sum all time entry costs for this project up to and including the selected month
          const entriesUpToSelectedMonth = await db
            .select({
              durationSeconds: timeEntries.durationSeconds,
              ratePerHour: timeEntries.ratePerHour,
              date: timeEntries.date,
            })
            .from(timeEntries)
            .where(
              and(
                eq(timeEntries.projectId, projectId),
                lt(timeEntries.date, nextMonthStartIso)
              )
            )

          let totalSpendToDateDecimal = new Decimal(0)
          for (const entry of entriesUpToSelectedMonth) {
            const rate = new Decimal(entry.ratePerHour)
            const hours = new Decimal(entry.durationSeconds).div(3600)
            totalSpendToDateDecimal = totalSpendToDateDecimal.add(
              rate.mul(hours)
            )
          }

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
          const departmentMap = new Map<string, MonthlyBreakdownDepartment>()
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
                users: new Map<string, MonthlyBreakdownUser>(),
              })
            }

            const department = departmentMap.get(entry.departmentId)!

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

            const user = department.users.get(entry.userId)!

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

          // 6. Convert maps to arrays and calculate department-specific percentages
          const departments = Array.from(departmentMap.values()).map((dept) => {
            // Get department-specific retainer fee - only if they have a defined split
            const deptRetainerFee = departmentRetainerFees.get(dept.id) || 0

            const deptLeftover = deptRetainerFee - dept.totalSpend
            const deptUsedPercentage =
              deptRetainerFee > 0
                ? Math.round((dept.totalSpend / deptRetainerFee) * 100)
                : 0
            const deptRemainingPercentage =
              deptRetainerFee > 0
                ? Math.round((deptLeftover / deptRetainerFee) * 100)
                : 0

            return {
              ...dept,
              users: Array.from(dept.users.values()),
              retainerFee: deptRetainerFee,
              leftover: deptLeftover,
              usedPercentage: deptUsedPercentage,
              remainingPercentage: deptRemainingPercentage,
            }
          })

          // Overall project calculations (unchanged for backward compatibility)
          const leftover = totalRetainerFee - totalSpend
          const usedPercentage =
            totalRetainerFee > 0
              ? Math.round((totalSpend / totalRetainerFee) * 100)
              : 0
          const remainingPercentage =
            totalRetainerFee > 0
              ? Math.round((leftover / totalRetainerFee) * 100)
              : 0

          // 7. Structure Response - Create separate breakdowns for each department
          const departmentBreakdowns = departments.map((dept) => ({
            department: {
              id: dept.id,
              name: dept.name,
              color: dept.color,
            },
            monthData: {
              year: yearNum,
              month: monthNum,
              retainerFee: dept.retainerFee,
              totalSpend: dept.totalSpend,
              leftover: dept.leftover,
              usedPercentage: dept.usedPercentage,
              remainingPercentage: dept.remainingPercentage,
            },
            users: dept.users,
          }))

          // Also include overall project data for reference
          return {
            project: {
              id: projectDetails.id,
              name: projectDetails.name,
            },
            overallMonthData: {
              year: yearNum,
              month: monthNum,
              retainerFee: totalRetainerFee,
              totalSpend,
              leftover,
              usedPercentage,
              remainingPercentage,
            },
            overallProjectData: {
              // Lifetime project budget and usage up to the selected month
              totalBudget: totalBudgetToDateDecimal
                .toDecimalPlaces(2)
                .toNumber(),
              totalSpendToDate: totalSpendToDateDecimal
                .toDecimalPlaces(2)
                .toNumber(),
              leftoverToDate: totalBudgetToDateDecimal
                .minus(totalSpendToDateDecimal)
                .toDecimalPlaces(2)
                .toNumber(),
              usedPercentageToDate: totalBudgetToDateDecimal.gt(0)
                ? Math.round(
                    totalSpendToDateDecimal
                      .div(totalBudgetToDateDecimal)
                      .mul(100)
                      .toNumber()
                  )
                : 0,
              // Also surface this month's spend for convenience
              totalSpendThisMonth: new Decimal(totalSpend)
                .toDecimalPlaces(2)
                .toNumber(),
            },
            departmentBreakdowns,
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
      // Department Budget Splits endpoints
      .get(
        "/:projectId/department-splits",
        async ({ params, db }) => {
          const { projectId } = params

          try {
            const splits = await db
              .select({
                id: projectDepartmentBudgetSplits.id,
                departmentId: projectDepartmentBudgetSplits.departmentId,
                budgetAmount: projectDepartmentBudgetSplits.budgetAmount,
                createdAt: projectDepartmentBudgetSplits.createdAt,
                updatedAt: projectDepartmentBudgetSplits.updatedAt,
                departmentName: departmentsTable.name,
                departmentColor: departmentsTable.color,
              })
              .from(projectDepartmentBudgetSplits)
              .innerJoin(
                departmentsTable,
                eq(
                  projectDepartmentBudgetSplits.departmentId,
                  departmentsTable.id
                )
              )
              .where(eq(projectDepartmentBudgetSplits.projectId, projectId))

            return splits
          } catch (error) {
            console.error("Error fetching department splits:", error)
            throw new Error("Failed to fetch department budget splits")
          }
        },
        {
          params: t.Object({
            projectId: UUID,
          }),
          detail: {
            summary: "Get department budget splits for a project (Admin)",
            tags: ["Admin", "Financials", "Department Splits"],
          },
        }
      )
      .post(
        "/:projectId/department-splits",
        async ({ params, body, db }) => {
          const { projectId } = params
          const { departmentId, budgetAmount } = body

          try {
            // 1. Check if there's a recurring budget for this project
            const recurringBudget =
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

            if (!recurringBudget) {
              return status(
                400,
                "No active recurring budget found for this project. Please set up a recurring budget before creating department splits."
              )
            }

            // 2. Calculate monthly budget amount
            const { amount, frequency, startDate, endDate } = recurringBudget
            const currentDate = new Date()
            const startDateObj = new Date(startDate)
            const endDateObj = endDate ? new Date(endDate) : null

            // Check if the recurring budget is currently active
            if (
              startDateObj > currentDate ||
              (endDateObj && endDateObj < currentDate)
            ) {
              return status(
                400,
                "The recurring budget is not currently active for this project."
              )
            }

            // Calculate monthly amount based on frequency
            const monthlyAmount = new Decimal(amount)
            let monthlyBudget = 0

            if (frequency === "monthly") {
              monthlyBudget = monthlyAmount.toNumber()
            } else if (frequency === "quarterly") {
              monthlyBudget = monthlyAmount.div(3).toNumber()
            } else if (frequency === "yearly") {
              monthlyBudget = monthlyAmount.div(12).toNumber()
            }

            // 3. Get existing splits for this project
            const existingSplits = await db
              .select({
                departmentId: projectDepartmentBudgetSplits.departmentId,
                budgetAmount: projectDepartmentBudgetSplits.budgetAmount,
              })
              .from(projectDepartmentBudgetSplits)
              .where(eq(projectDepartmentBudgetSplits.projectId, projectId))

            // 4. Calculate total allocated budget
            let totalAllocated = 0
            let isUpdate = false

            for (const split of existingSplits) {
              if (split.departmentId === departmentId) {
                isUpdate = true
                // Skip the current split being updated - we'll add the new amount
                continue
              }
              totalAllocated += new Decimal(split.budgetAmount).toNumber()
            }

            // Add the new/updated amount
            totalAllocated += budgetAmount

            // 5. Check if total exceeds monthly budget
            if (totalAllocated > monthlyBudget) {
              return status(
                400,
                `Total department budget splits ($${totalAllocated.toFixed(
                  2
                )}) cannot exceed the monthly recurring budget ($${monthlyBudget.toFixed(
                  2
                )}). Please reduce the budget amount or remove other department splits.`
              )
            }

            // 6. Proceed with create/update
            if (isUpdate) {
              // Update existing split
              await db
                .update(projectDepartmentBudgetSplits)
                .set({
                  budgetAmount: budgetAmount.toString(),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(projectDepartmentBudgetSplits.projectId, projectId),
                    eq(projectDepartmentBudgetSplits.departmentId, departmentId)
                  )
                )
            } else {
              // Create new split
              await db.insert(projectDepartmentBudgetSplits).values({
                projectId,
                departmentId,
                budgetAmount: budgetAmount.toString(),
              })
            }

            return { success: true }
          } catch (error) {
            console.error("Error managing department split:", error)
            throw new Error("Failed to manage department budget split")
          }
        },
        {
          params: t.Object({
            projectId: UUID,
          }),
          body: t.Object({
            departmentId: UUID,
            budgetAmount: t.Number({ min: 0.01 }),
          }),
          detail: {
            summary: "Create or update department budget split (Admin)",
            tags: ["Admin", "Financials", "Department Splits"],
          },
        }
      )
      .delete(
        "/:projectId/department-splits/:departmentId",
        async ({ params, db }) => {
          const { projectId, departmentId } = params

          try {
            await db
              .delete(projectDepartmentBudgetSplits)
              .where(
                and(
                  eq(projectDepartmentBudgetSplits.projectId, projectId),
                  eq(projectDepartmentBudgetSplits.departmentId, departmentId)
                )
              )

            return { success: true }
          } catch (error) {
            console.error("Error deleting department split:", error)
            throw new Error("Failed to delete department budget split")
          }
        },
        {
          params: t.Object({
            projectId: UUID,
            departmentId: UUID,
          }),
          detail: {
            summary: "Delete department budget split (Admin)",
            tags: ["Admin", "Financials", "Department Splits"],
          },
        }
      )
      // GET Lifetime Project Data (not affected by date filters)
      .get(
        "/:projectId/lifetime",
        async ({ params, db, status }) => {
          const { projectId } = params

          try {
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

            // 2. Fetch ALL Budget Injections (no date filtering)
            const allBudgetInjections =
              await db.query.projectBudgetInjections.findMany({
                where: eq(projectBudgetInjections.projectId, projectId),
                columns: {
                  id: true,
                  budget: true,
                  date: true,
                  description: true,
                },
                orderBy: [asc(projectBudgetInjections.date)],
              })

            // 3. Fetch ALL Time Entries (no date filtering)
            const allTimeEntries = await db
              .select({
                id: timeEntries.id,
                date: timeEntries.date,
                durationSeconds: timeEntries.durationSeconds,
                ratePerHour: timeEntries.ratePerHour,
                userId: timeEntries.userId,
                userName: users.email,
              })
              .from(timeEntries)
              .innerJoin(users, eq(timeEntries.userId, users.id))
              .where(eq(timeEntries.projectId, projectId))
              .orderBy(asc(timeEntries.date))

            // 4. Calculate lifetime totals
            const totalBudgetLifetime = allBudgetInjections.reduce(
              (sum, b) => sum.add(new Decimal(b.budget)),
              new Decimal(0)
            )

            let totalSpendLifetime = new Decimal(0)
            for (const entry of allTimeEntries) {
              const rate = new Decimal(entry.ratePerHour)
              const hours = new Decimal(entry.durationSeconds).div(3600)
              totalSpendLifetime = totalSpendLifetime.add(rate.mul(hours))
            }

            const leftoverLifetime =
              totalBudgetLifetime.minus(totalSpendLifetime)
            const usedPercentageLifetime = totalBudgetLifetime.gt(0)
              ? Math.round(
                  totalSpendLifetime
                    .div(totalBudgetLifetime)
                    .mul(100)
                    .toNumber()
                )
              : 0

            return {
              project: {
                id: projectDetails.id,
                name: projectDetails.name,
              },
              lifetimeData: {
                totalBudget: totalBudgetLifetime.toDecimalPlaces(2).toNumber(),
                totalSpend: totalSpendLifetime.toDecimalPlaces(2).toNumber(),
                leftover: leftoverLifetime.toDecimalPlaces(2).toNumber(),
                usedPercentage: usedPercentageLifetime,
                totalEntries: allTimeEntries.length,
                totalBudgetInjections: allBudgetInjections.length,
              },
            }
          } catch (error) {
            console.error("Error fetching lifetime project data:", error)
            return status(500, "Failed to fetch lifetime project data")
          }
        },
        {
          params: t.Object({
            projectId: UUID,
          }),
          detail: {
            summary:
              "Get lifetime project data (not affected by date filters) (Admin)",
            tags: ["Admin", "Financials", "Lifetime Data"],
          },
        }
      )
)
