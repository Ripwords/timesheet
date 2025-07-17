import { desc, eq, and, gte, lte, SQL, inArray } from "drizzle-orm"
import { t } from "elysia"
import { baseApp } from "../../utils/baseApp"
import * as schema from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { UUID } from "../../utils/validators"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

// Helper to safely read the user's timezone header (case-insensitive)
const extractUserTimezone = (
  headers: Record<string, string | undefined>
): string | undefined => {
  // HTTP header names are case-insensitive but depending on the server
  // implementation the original casing might be preserved. Iterate once
  // to find a matching key regardless of its case.
  const target = "x-user-timezone"
  for (const key in headers) {
    if (key.toLowerCase() === target) return headers[key]
  }
  return undefined
}

// Helper function to get today's date in user's timezone
const getUserTimezoneToday = (userTimezone?: string): string => {
  if (userTimezone) {
    return dayjs().tz(userTimezone).format("YYYY-MM-DD")
  }
  // Fallback to server timezone if not provided
  return dayjs().format("YYYY-MM-DD")
}

export const timeEntries = baseApp("time-entries").group(
  "/time-entries",
  (app) => {
    return (
      app
        .use(authGuard())
        .post(
          "/",
          async (ctx) => {
            const { db, body, status, headers } = ctx
            const user = await ctx.getUser()
            if (!user) {
              return status(401, "Unauthorized")
            }

            // Get user's timezone from header
            const userTimezone = extractUserTimezone(headers)

            // Validate that time entry is only for today in user's timezone
            const today = getUserTimezoneToday(userTimezone)
            if (!dayjs(body.date).isSame(today, "day")) {
              return status(
                400,
                `Time entries can only be submitted for today (${today})`
              )
            }

            try {
              const newTimeEntry = await db.transaction(async (tx) => {
                // Get user's current rate for historical tracking
                const userRecord = await tx.query.users.findFirst({
                  where: eq(schema.users.id, user.userId),
                  columns: {
                    ratePerHour: true,
                  },
                })

                if (!userRecord) {
                  return status(400, "User not found")
                }

                const newTimeEntry = await tx
                  .insert(schema.timeEntries)
                  .values({
                    userId: user.userId,
                    projectId: body.projectId,
                    description: body.description,
                    date: body.date,
                    durationSeconds: body.durationSeconds,
                    ratePerHour: userRecord.ratePerHour, // Capture current rate for historical accuracy
                  })
                  .returning() // Return the newly created entry

                if (!newTimeEntry || newTimeEntry.length === 0) {
                  return status(500, "Failed to create time entry")
                }

                return newTimeEntry[0]
              })

              return newTimeEntry
            } catch (e) {
              console.error("Error creating time entry", e)
              return status(500, "Internal Server Error")
            }
          },
          {
            body: t.Object({
              projectId: UUID,
              date: t.String({ format: "date" }),
              durationSeconds: t.Integer(),
              description: t.Optional(t.String()),
            }),
            detail: {
              summary: "Create a new time entry",
              tags: ["TimeEntries"],
            },
          }
        )
        .get(
          "/",
          async (ctx) => {
            const { db, status, query } = ctx
            const user = await ctx.getUser()
            if (!user) {
              return status(401, "Unauthorized")
            }

            const { startDate, endDate } = query
            if (typeof query.userId === "string") {
              query.userId = [query.userId]
            }

            // Base condition: entries must belong to the user if user is not admin
            let conditions: SQL[] = []
            if (user.role !== "admin") {
              conditions.push(eq(schema.timeEntries.userId, user.userId))
            } else if (query.userId) {
              conditions.push(inArray(schema.timeEntries.userId, query.userId))
            }

            // Add start date condition if provided
            if (startDate) {
              try {
                const start = dayjs(startDate).format("YYYY-MM-DD")
                conditions.push(gte(schema.timeEntries.date, start))
              } catch {
                return status(400, "Invalid startDate format. Use YYYY-MM-DD.")
              }
            }

            // Add end date condition if provided
            if (endDate) {
              try {
                const end = dayjs(endDate).format("YYYY-MM-DD")
                conditions.push(lte(schema.timeEntries.date, end))
              } catch {
                return status(400, "Invalid endDate format. Use YYYY-MM-DD.")
              }
            }

            // Fetch entries using combined conditions
            const userTimeEntries = await db
              .select()
              .from(schema.timeEntries)
              .innerJoin(
                schema.projects,
                eq(schema.timeEntries.projectId, schema.projects.id)
              )
              .where(and(...conditions))
              .orderBy(desc(schema.timeEntries.date))

            return userTimeEntries
          },
          {
            detail: {
              summary:
                "Get all time entries for the logged-in user, optionally filtered by date range",
              tags: ["TimeEntries"],
            },
            query: t.Object({
              startDate: t.Optional(
                t.String({
                  format: "date",
                  description: "Date format e.g., 2024-01-01",
                })
              ),
              endDate: t.Optional(
                t.String({
                  format: "date",
                  description: "Date format e.g., 2024-01-31",
                })
              ),
              userId: t.Optional(t.Array(UUID)),
            }),
          }
        )
        .get(
          "/project/:id",
          async (ctx) => {
            const { db, params, query, status } = ctx
            const user = await ctx.getUser()
            if (!user) {
              return status(401, "Unauthorized")
            }

            const { startDate, endDate } = query
            // Base condition: entries must belong to the user if user is not admin
            let conditions: SQL[] = []
            if (user.role !== "admin") {
              conditions.push(eq(schema.timeEntries.userId, user.userId))
            } else if (query.userId) {
              conditions.push(eq(schema.timeEntries.userId, query.userId))
            }

            // Add start date condition if provided
            if (startDate) {
              try {
                const start = dayjs(startDate).format("YYYY-MM-DD")
                conditions.push(gte(schema.timeEntries.date, start))
              } catch {
                return status(400, "Invalid startDate format. Use YYYY-MM-DD.")
              }
            }

            // Add end date condition if provided
            if (endDate) {
              try {
                const end = dayjs(endDate).format("YYYY-MM-DD")
                conditions.push(lte(schema.timeEntries.date, end))
              } catch {
                return status(400, "Invalid endDate format. Use YYYY-MM-DD.")
              }
            }

            const timeEntry = await db.query.timeEntries.findMany({
              where: and(
                eq(schema.timeEntries.projectId, params.id),
                ...conditions
              ),
            })

            if (!timeEntry) {
              return status(404, "Time entry not found")
            }

            // Authorization check: User must own the entry OR be an admin
            if (
              timeEntry.some((entry) => entry.userId !== user.userId) &&
              user.role !== "admin"
            ) {
              return status(403, "Forbidden: You do not own this time entry")
            }

            return timeEntry
          },
          {
            params: t.Object({
              id: t.String({
                format: "uuid",
              }),
            }),
            query: t.Object({
              startDate: t.Optional(
                t.String({
                  format: "date",
                  description: "Date format e.g., 2024-01-01",
                })
              ),
              endDate: t.Optional(
                t.String({
                  format: "date",
                  description: "Date format e.g., 2024-01-31",
                })
              ),
              userId: t.Optional(UUID),
            }),
            detail: {
              summary: "Get a single time entry by ID",
              tags: ["TimeEntries"],
            },
          }
        )
        .get(
          "/department-list",
          async (ctx) => {
            const { db, status } = ctx
            const userPayload = await ctx.getUser()
            if (!userPayload) {
              return status(401, "Unauthorized")
            }

            // Fetch the user's department from the database using the userId from the payload
            const userRecord = await db
              .select({
                departmentId: schema.departments.id,
                departmentName: schema.departments.name,
              })
              .from(schema.users)
              .innerJoin(
                schema.departments,
                eq(schema.users.departmentId, schema.departments.id)
              )
              .where(eq(schema.users.id, userPayload.userId))
              .limit(1)
              .then((res) => res[0])

            // Ensure the user record and department exist
            if (!userRecord || !userRecord.departmentId) {
              console.warn(
                `User ${userPayload.userId} not found or has no department assigned.`
              )
              return status(400, "User department not set or user not found")
            }

            const userDepartment = userRecord.departmentId

            try {
              const defaultDescriptions = await db
                .select({
                  id: schema.departmentDefaultDescription.id,
                })
                .from(schema.departmentDefaultDescription)
                .where(
                  eq(
                    schema.departmentDefaultDescription.departmentId,
                    userDepartment
                  )
                )

              return defaultDescriptions
            } catch {
              return status(500, "Internal Server Error")
            }
          },
          {
            detail: {
              summary: "Get the list of departments",
              description: "Fetches a list of departments.",
              tags: ["TimeEntries", "Defaults"],
            },
          }
        )
        .get(
          "/defaults",
          async (ctx) => {
            const { db, status } = ctx
            const userPayload = await ctx.getUser()
            if (!userPayload) {
              return status(401, "Unauthorized")
            }

            const user = await db.query.users.findFirst({
              where: eq(schema.users.id, userPayload.userId),
            })

            if (!user) {
              return status(400, "User not found")
            }

            // Fetch the user's department from the database using the userId from the payload
            const userDefaultDescriptions = await db
              .select({
                id: schema.departmentDefaultDescription.id,
                description: schema.departmentDefaultDescription.description,
              })
              .from(schema.departmentDefaultDescription)
              .where(
                eq(
                  schema.departmentDefaultDescription.departmentId,
                  user.departmentId
                )
              )

            const departmentThreshold = await db.query.departments.findFirst({
              where: eq(schema.departments.id, user.departmentId),
              columns: {
                maxSessionMinutes: true,
              },
            })

            // Ensure the user record and department exist
            if (!userDefaultDescriptions) {
              console.warn(
                `User ${userPayload.userId} not found or has no department assigned.`
              )
              return status(400, "User department not set or user not found")
            }

            return {
              defaultDescriptions: userDefaultDescriptions,
              departmentThreshold: departmentThreshold?.maxSessionMinutes,
            }
          },
          {
            detail: {
              summary: "Get default time entry descriptions",
              description:
                "Fetches a list of predefined time entry descriptions based on the logged-in user's assigned department.",
              tags: ["TimeEntries", "Defaults"],
            },
          }
        )
        // UPDATE Time Entry
        .put(
          "/id/:id",
          async (ctx) => {
            const { db, params, body, status, headers } = ctx
            const user = await ctx.getUser()
            if (!user) {
              return status(401, "Unauthorized")
            }

            // Get user's timezone from header
            const userTimezone = extractUserTimezone(headers)

            // 1. Find the existing entry first to check ownership
            const existingEntry = await db.query.timeEntries.findFirst({
              where: eq(schema.timeEntries.id, params.id), // Use numeric ID
              columns: { id: true, userId: true }, // Only fetch necessary columns
            })

            if (!existingEntry) {
              return status(404, "Time entry not found")
            }

            // 2. Authorization check: Only the owner can update their entry
            if (existingEntry.userId !== user.userId) {
              // Admins typically shouldn't modify others' time entries directly
              // If admin override is needed, add `&& user.role !== "admin"` check here
              return status(403, "Forbidden: You cannot update this time entry")
            }

            // 3. Validate that the existing entry is from today (can only edit today's entries)
            const existingEntryDate = await db.query.timeEntries.findFirst({
              where: eq(schema.timeEntries.id, params.id),
              columns: { date: true },
            })

            if (existingEntryDate) {
              const today = getUserTimezoneToday(userTimezone)
              if (!dayjs(existingEntryDate.date).isSame(today, "day")) {
                return status(
                  400,
                  "You can only edit time entries created today"
                )
              }
            }

            // 4. If updating the date, validate it's for today
            if (body.date !== undefined) {
              const today = getUserTimezoneToday(userTimezone)
              if (!dayjs(body.date).isSame(today, "day")) {
                return status(
                  400,
                  `Time entries can only be updated to today's date (${today})`
                )
              }
            }

            // 5. Perform the update
            try {
              const updatedEntry = await db
                .update(schema.timeEntries)
                .set({
                  // Only update fields provided in the body
                  ...(body.projectId !== undefined && {
                    projectId: body.projectId,
                  }),
                  ...(body.date !== undefined && {
                    date: body.date,
                  }),
                  ...(body.durationSeconds !== undefined && {
                    durationSeconds: body.durationSeconds,
                  }),
                  ...(body.description !== undefined && {
                    description: body.description,
                  }),
                  updatedAt: new Date(),
                })
                .where(eq(schema.timeEntries.id, params.id)) // Use numeric ID
                .returning() // Return the updated entry

              if (!updatedEntry || updatedEntry.length === 0) {
                // This case might be redundant due to the initial findFirst check,
                // but good for robustness.
                return status(500, "Failed to update time entry")
              }

              return updatedEntry[0]
            } catch (e) {
              // Handle potential foreign key constraint errors if projectId is invalid
              if (
                e instanceof Error &&
                e.message.includes("violates foreign key constraint")
              ) {
                return status(400, `Invalid projectId: ${body.projectId}`)
              }
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
              projectId: t.Optional(UUID),
              date: t.Optional(t.String({ format: "date" })),
              durationSeconds: t.Optional(t.Integer()),
              description: t.Optional(t.String()),
            }),
            detail: {
              summary: "Update a time entry by ID",
              tags: ["TimeEntries"],
            },
          }
        )
        // DELETE Time Entry
        .delete(
          "/id/:id",
          async (ctx) => {
            const { db, params, status, headers } = ctx
            const user = await ctx.getUser()
            if (!user) {
              return status(401, "Unauthorized")
            }

            // Get user's timezone from header
            const userTimezone = extractUserTimezone(headers)

            // 1. Find the existing entry first to check ownership
            const existingEntry = await db.query.timeEntries.findFirst({
              where: eq(schema.timeEntries.id, params.id), // Use numeric ID
              columns: { id: true, userId: true }, // Only fetch necessary columns
            })

            if (!existingEntry) {
              return status(404, "Time entry not found")
            }

            // 2. Authorization check: Only the owner can delete their entry
            if (existingEntry.userId !== user.userId) {
              // Admins typically shouldn't delete others' time entries directly
              // If admin override is needed, add `&& user.role !== "admin"` check here
              return status(403, "Forbidden: You cannot delete this time entry")
            }

            // 3. Validate that the existing entry is from today (can only delete today's entries)
            const existingEntryDate = await db.query.timeEntries.findFirst({
              where: eq(schema.timeEntries.id, params.id),
              columns: { date: true },
            })

            if (existingEntryDate) {
              const today = getUserTimezoneToday(userTimezone)
              if (!dayjs(existingEntryDate.date).isSame(today, "day")) {
                return status(
                  400,
                  "You can only delete time entries created today"
                )
              }
            }

            // 4. Perform the deletion
            try {
              const deletedEntry = await db
                .delete(schema.timeEntries)
                .where(eq(schema.timeEntries.id, params.id)) // Use numeric ID
                .returning({ id: schema.timeEntries.id }) // Return the id of the deleted item

              if (!deletedEntry || deletedEntry.length === 0) {
                return status(500, "Failed to delete time entry")
              }

              return deletedEntry[0]
            } catch {
              // Handle potential DB errors if necessary
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
              summary: "Delete a time entry by ID",
              tags: ["TimeEntries"],
            },
          }
        )
    )
  }
)
