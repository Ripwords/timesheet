import { error, t } from "elysia"
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm"
import { baseApp } from "../../utils/baseApp"
import { projects, timeEntries, users } from "../db/schema"
import { authGuard } from "../middleware/authGuard"

interface AggregateDataPoint {
  [key: string]: string | number | Date | undefined // More specific index signature
}

export const adminReportsRoutes = baseApp("reports").group(
  "/admin/reports",
  (app) =>
    app.use(authGuard()).get(
      "/aggregate",
      async ({ query, db, getUser }) => {
        const {
          startDate,
          endDate,
          groupBy,
          timeUnit = "day",
          projectIds,
        } = query
        let { userIds } = query

        const user = await getUser()
        if (user && user.role !== "admin") {
          userIds = [user.userId]
        }

        // Ensure filters array always has at least one element to prevent `and()` error
        // A default condition like `sql`true` ` or similar can be used if needed,
        // but often checks below handle empty cases.
        const filters = []
        if (startDate)
          filters.push(gte(timeEntries.startTime, new Date(startDate)))
        if (endDate) filters.push(lte(timeEntries.endTime, new Date(endDate)))
        // Ensure arrays are not empty before using inArray
        if (userIds && userIds.length > 0)
          filters.push(inArray(timeEntries.userId, userIds))
        if (projectIds && projectIds.length > 0)
          filters.push(inArray(timeEntries.projectId, projectIds))

        // Handle the case where filters might be empty if no query params are provided
        const whereCondition = filters.length > 0 ? and(...filters) : undefined

        const dateTrunc = sql<string>`date_trunc(${sql.raw(`'${timeUnit}'`)}, ${
          timeEntries.startTime
        } AT TIME ZONE 'UTC')`

        let queryBuilder

        const totalDurationSeconds =
          sql<number>`sum(${timeEntries.durationSeconds})`.mapWith(Number)

        // Determine if time grouping is needed
        const includeTimeGrouping = timeUnit && timeUnit !== "none"

        if (groupBy === "project") {
          queryBuilder = db
            .select({
              id: projects.id,
              name: projects.name,
              totalDuration: totalDurationSeconds,
              ...(includeTimeGrouping && { timePeriod: dateTrunc }), // Conditionally add timePeriod
            })
            .from(timeEntries)
            .leftJoin(projects, eq(timeEntries.projectId, projects.id))
            .$dynamic()
            .groupBy(
              projects.id,
              projects.name,
              ...(includeTimeGrouping ? [dateTrunc] : [])
            ) // Conditionally group by time
            .orderBy(desc(totalDurationSeconds))
        } else if (groupBy === "user") {
          queryBuilder = db
            .select({
              id: users.id,
              email: users.email,
              totalDuration: totalDurationSeconds,
              ...(includeTimeGrouping && { timePeriod: dateTrunc }), // Conditionally add timePeriod
            })
            .from(timeEntries)
            .leftJoin(users, eq(timeEntries.userId, users.id))
            .$dynamic()
            .groupBy(
              users.id,
              users.email,
              ...(includeTimeGrouping ? [dateTrunc] : [])
            ) // Conditionally group by time
            .orderBy(desc(totalDurationSeconds))
        } else {
          // Default case: Aggregate total duration without grouping by project/user
          queryBuilder = db
            .select({
              totalDuration: totalDurationSeconds,
              ...(includeTimeGrouping && { timePeriod: dateTrunc }), // Still allow time grouping for overall total
            })
            .from(timeEntries)
            .$dynamic()
            .groupBy(...(includeTimeGrouping ? [dateTrunc] : []))
            // No specific order needed for single total, unless grouped by time
            .orderBy(...(includeTimeGrouping ? [asc(dateTrunc)] : []))
        }

        // Apply the where condition if filters exist
        if (whereCondition) {
          queryBuilder.where(whereCondition)
        }

        try {
          const results = await queryBuilder
          return results as AggregateDataPoint[]
        } catch (e) {
          console.error("Error fetching aggregated report:", e)
          const message =
            e instanceof Error ? e.message : "Unknown error occurred"
          throw error(500, `Failed to fetch aggregated report data: ${message}`)
        }
      },
      {
        query: t.Object({
          startDate: t.Optional(
            t.String({
              format: "date-time",
              error: "Invalid start date format",
            })
          ),
          endDate: t.Optional(
            t.String({
              format: "date-time",
              error: "Invalid end date format",
            })
          ),
          // Allow groupBy to be optional for total aggregation
          groupBy: t.Optional(
            t.Union([t.Literal("project"), t.Literal("user")], {
              error: "Invalid groupBy value",
            })
          ),
          timeUnit: t.Optional(
            t.Union(
              [
                t.Literal("day"),
                t.Literal("week"),
                t.Literal("month"),
                t.Literal("year"),
                t.Literal("none"),
              ],
              { default: "day", error: "Invalid timeUnit value" }
            )
          ), // day, week, month, year, or 'none' for total
          // Ensure IDs are numbers
          userIds: t.Optional(
            t.Array(t.Numeric(), {
              error: "Invalid userIds format, must be array of numbers",
            })
          ),
          projectIds: t.Optional(
            t.Array(t.Numeric(), {
              error: "Invalid projectIds format, must be array of numbers",
            })
          ),
        }),
        detail: {
          summary: "Get aggregated time entry data for reports",
          description:
            "Fetches summed time entry durations, grouped by project or user, optionally filtered by date range, users, and projects. Can also aggregate over time units (day, week, month, year). Set timeUnit to 'none' for total aggregation without time periods.",
          tags: ["Admin", "Reports"],
        },
      }
    )
)
