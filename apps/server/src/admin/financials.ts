import { Decimal } from "decimal.js" // For precise calculations with numeric types
import { asc, eq, and, gte, lt, lte } from "drizzle-orm"
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

          // Fetch budget injections for all projects
          const budgetInjections =
            await db.query.projectBudgetInjections.findMany({
              columns: {
                projectId: true,
                budget: true,
              },
            })

          // Create a map of project budgets
          const projectBudgets = new Map<string, Decimal>()
          for (const injection of budgetInjections) {
            const currentBudget =
              projectBudgets.get(injection.projectId) || new Decimal(0)
            projectBudgets.set(
              injection.projectId,
              currentBudget.add(new Decimal(injection.budget))
            )
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
            userRecord[`week${weekNumber}` as keyof Pick<ProjectUserRecord, 'week1' | 'week2' | 'week3' | 'week4' | 'week5'>] += hours.toNumber()
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

          // 6. Convert maps to arrays and calculate percentages
          const departments = Array.from(
            departmentMap.values()
          ).map((dept) => ({
            ...dept,
            users: Array.from(dept.users.values()),
          }))

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
