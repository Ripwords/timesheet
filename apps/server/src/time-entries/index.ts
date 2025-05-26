import { desc, eq, and, gte, lte, SQL, inArray } from "drizzle-orm"
import { t } from "elysia"
import { baseApp } from "../../utils/baseApp"
import * as schema from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { UUID } from "../../utils/validtors"
import { error as logError } from "@rasla/logify"
import dayjs from "dayjs"
export const timeEntries = baseApp("time-entries").group(
  "/time-entries",
  (app) =>
    app
      .use(authGuard())
      .post(
        "/",
        async ({ db, body, status, getUser }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const newTimeEntry = await db
              .insert(schema.timeEntries)
              .values({
                userId: user.userId,
                projectId: body.projectId,
                description: body.description,
                startTime: body.startTime, // Drizzle expects Date objects
                endTime: body.endTime, // Drizzle expects Date objects
                durationSeconds: body.durationSeconds,
              })
              .returning() // Return the newly created entry

            if (!newTimeEntry || newTimeEntry.length === 0) {
              return status(500, "Failed to create time entry")
            }

            return newTimeEntry[0]
          } catch (e) {
            logError(`Failed to create time entry: ${e}`)
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
          body: t.Object({
            projectId: UUID,
            startTime: t.Date(),
            endTime: t.Date(),
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
        async ({ db, getUser, status, query }) => {
          const { startDate, endDate } = query
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          console.log("query.userId", query.userId)
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
              const start = dayjs(startDate).startOf("day").toDate()
              // Check if date is valid before pushing condition
              if (isNaN(start.getTime())) throw new Error("Invalid Date Object")
              conditions.push(gte(schema.timeEntries.startTime, start))
            } catch (e) {
              logError(`Invalid startDate format: ${startDate} ${e}`)
              return status(400, "Invalid startDate format. Use ISO 8601.")
            }
          }

          // Add end date condition if provided
          if (endDate) {
            try {
              const end = dayjs(endDate).endOf("day").toDate()
              // Check if date is valid before pushing condition
              if (isNaN(end.getTime())) throw new Error("Invalid Date Object")
              // Make the end date inclusive by setting time to the end of the day
              // or adding one day and using less than (depends on preference)
              // Here, we add 1 day and use less than the *start* of the next day (UTC)
              end.setUTCHours(0, 0, 0, 0)
              end.setUTCDate(end.getUTCDate() + 1)
              conditions.push(lte(schema.timeEntries.startTime, end))
            } catch (e) {
              logError(`Invalid endDate format: ${endDate} ${e}`)
              return status(400, "Invalid endDate format. Use ISO 8601.")
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
            .orderBy(desc(schema.timeEntries.startTime))

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
                format: "date-time",
                description: "ISO 8601 format e.g., 2024-01-01T00:00:00Z",
              })
            ),
            endDate: t.Optional(
              t.String({
                format: "date-time",
                description: "ISO 8601 format e.g., 2024-01-31T23:59:59Z",
              })
            ),
            userId: t.Optional(t.Array(UUID)),
          }),
        }
      )
      .get(
        "/project/:id",
        async ({ db, params, query, status, getUser }) => {
          const { startDate, endDate } = query
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

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
              const start = dayjs(startDate).startOf("day").toDate()
              // Check if date is valid before pushing condition
              if (isNaN(start.getTime())) throw new Error("Invalid Date Object")
              conditions.push(gte(schema.timeEntries.startTime, start))
            } catch (e) {
              logError(`Invalid startDate format: ${startDate} ${e}`)
              return status(400, "Invalid startDate format. Use ISO 8601.")
            }
          }

          // Add end date condition if provided
          if (endDate) {
            try {
              const end = dayjs(endDate).endOf("day").toDate()
              // Check if date is valid before pushing condition
              if (isNaN(end.getTime())) throw new Error("Invalid Date Object")
              // Make the end date inclusive by setting time to the end of the day
              // or adding one day and using less than (depends on preference)
              // Here, we add 1 day and use less than the *start* of the next day (UTC)
              end.setUTCHours(0, 0, 0, 0)
              end.setUTCDate(end.getUTCDate() + 1)
              conditions.push(lte(schema.timeEntries.startTime, end))
            } catch (e) {
              logError(`Invalid endDate format: ${endDate} ${e}`)
              return status(400, "Invalid endDate format. Use ISO 8601.")
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
                format: "date-time",
                description: "ISO 8601 format e.g., 2024-01-01T00:00:00Z",
              })
            ),
            endDate: t.Optional(
              t.String({
                format: "date-time",
                description: "ISO 8601 format e.g., 2024-01-31T23:59:59Z",
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
        async ({ db, getUser, status }) => {
          const userPayload = await getUser()
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
          } catch (e) {
            logError(
              `Failed to fetch default descriptions for department ${userDepartment}: ${e}`
            )
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
        async ({ db, getUser, status }) => {
          const userPayload = await getUser()
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
        async ({ db, params, body, status, getUser }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

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

          // 3. Perform the update
          try {
            const updatedEntry = await db
              .update(schema.timeEntries)
              .set({
                // Only update fields provided in the body
                ...(body.projectId !== undefined && {
                  projectId: body.projectId,
                }),
                ...(body.startTime !== undefined && {
                  startTime: body.startTime,
                }),
                ...(body.endTime !== undefined && { endTime: body.endTime }),
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
            logError(`Failed to update time entry ${params.id}: ${e}`)
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
            startTime: t.Optional(t.Date()),
            endTime: t.Optional(t.Date()),
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
        async ({ db, params, status, getUser }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

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

          // 3. Perform the deletion
          try {
            const deletedEntry = await db
              .delete(schema.timeEntries)
              .where(eq(schema.timeEntries.id, params.id)) // Use numeric ID
              .returning({ id: schema.timeEntries.id }) // Return the id of the deleted item

            if (!deletedEntry || deletedEntry.length === 0) {
              return status(500, "Failed to delete time entry")
            }

            return deletedEntry[0]
          } catch (e) {
            logError(`Failed to delete time entry ${params.id}: ${e}`)
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
