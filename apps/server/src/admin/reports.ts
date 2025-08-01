import { t } from "elysia"
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm"
import { baseApp } from "../../utils/baseApp"
import { projects, timeEntries, users } from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { UUID } from "../../utils/validators"
import dayjs from "dayjs"
interface AggregateDataPoint {
  [key: string]: string | number | Date | undefined // More specific index signature
}

export const adminReportsRoutes = baseApp("reports").group(
  "/admin/reports",
  (app) =>
    app.use(authGuard()).get(
      "/aggregate",
      async ({ query, db, getUser, status }) => {
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
          filters.push(
            gte(timeEntries.date, dayjs(startDate).format("YYYY-MM-DD"))
          )
        if (endDate)
          filters.push(
            lte(timeEntries.date, dayjs(endDate).format("YYYY-MM-DD"))
          )
        // Ensure arrays are not empty before using inArray
        if (userIds && userIds.length > 0)
          filters.push(inArray(timeEntries.userId, userIds))
        if (projectIds && projectIds.length > 0)
          filters.push(inArray(timeEntries.projectId, projectIds))

        // Handle the case where filters might be empty if no query params are provided
        const whereCondition = filters.length > 0 ? and(...filters) : undefined

        const dateTrunc = sql<string>`date_trunc(${sql.raw(`'${timeUnit}'`)}, ${
          timeEntries.date
        })`

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
              isActive: projects.isActive,
              totalDuration: totalDurationSeconds,
              ...(includeTimeGrouping && { timePeriod: dateTrunc }), // Conditionally add timePeriod
            })
            .from(timeEntries)
            .leftJoin(projects, eq(timeEntries.projectId, projects.id))
            .$dynamic()
            .groupBy(
              projects.id,
              projects.name,
              projects.isActive,
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
        } catch {
          return status(500, "Failed to fetch aggregated report data")
        }
      },
      {
        query: t.Object({
          startDate: t.Optional(
            t.String({
              format: "date",
              error: "Invalid start date format",
            })
          ),
          endDate: t.Optional(
            t.String({
              format: "date",
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
            t.Array(UUID, {
              error: "Invalid userIds format, must be array of UUIDs",
            })
          ),
          projectIds: t.Optional(
            t.Array(UUID, {
              error: "Invalid projectIds format, must be array of UUIDs",
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
