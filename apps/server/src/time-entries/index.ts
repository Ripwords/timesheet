import { desc, eq, and, gte, lte } from "drizzle-orm"
import { t } from "elysia"
import { baseApp } from "../../utils/baseApp"
import * as schema from "../db/schema"
import { authGuard } from "../middleware/authGuard"

export const timeEntries = baseApp("time-entries").group(
  "/time-entries",
  (app) =>
    app
      .use(authGuard)
      // CREATE Time Entry
      .post(
        "/",
        async ({ db, body, error, getUser }) => {
          const user = await getUser()
          if (!user) {
            // Should be handled by authGuard, but good practice to check
            return error(401, "Unauthorized")
          }

          // Validate project exists? Optional, depends on requirements.
          // For now, assume projectId is valid.

          try {
            const newTimeEntry = await db
              .insert(schema.timeEntries)
              .values({
                userId: user.userId,
                projectId: body.projectId,
                startTime: body.startTime, // Drizzle expects Date objects
                endTime: body.endTime, // Drizzle expects Date objects
                durationSeconds: body.durationSeconds,
              })
              .returning() // Return the newly created entry

            if (!newTimeEntry || newTimeEntry.length === 0) {
              return error(500, "Failed to create time entry")
            }

            return newTimeEntry[0]
          } catch (e) {
            console.error("Failed to create time entry:", e)
            // Handle potential foreign key constraint errors if projectId is invalid
            if (
              e instanceof Error &&
              e.message.includes("violates foreign key constraint")
            ) {
              return error(400, `Invalid projectId: ${body.projectId}`)
            }
            return error(500, "Internal Server Error")
          }
        },
        {
          body: t.Object({
            projectId: t.Numeric(),
            startTime: t.Date(), // Use t.Date(), assumes input can be parsed to Date
            endTime: t.Date(),
            durationSeconds: t.Integer(),
          }),
          detail: {
            summary: "Create a new time entry",
            tags: ["TimeEntries"],
          },
        }
      )
      // READ All Time Entries for User
      .get(
        "/",
        async ({ db, getUser, error, query }) => {
          const { startDate, endDate } = query
          const user = await getUser()
          if (!user) {
            return error(401, "Unauthorized")
          }

          // Base condition: entries must belong to the user
          const conditions = [eq(schema.timeEntries.userId, user.userId)]

          // Add start date condition if provided
          if (startDate) {
            try {
              const start = new Date(startDate)
              // Check if date is valid before pushing condition
              if (isNaN(start.getTime())) throw new Error("Invalid Date Object")
              conditions.push(gte(schema.timeEntries.startTime, start))
            } catch (e) {
              console.error("Invalid startDate format:", startDate, e)
              return error(400, "Invalid startDate format. Use ISO 8601.")
            }
          }

          // Add end date condition if provided
          if (endDate) {
            try {
              const end = new Date(endDate)
              // Check if date is valid before pushing condition
              if (isNaN(end.getTime())) throw new Error("Invalid Date Object")
              // Make the end date inclusive by setting time to the end of the day
              // or adding one day and using less than (depends on preference)
              // Here, we add 1 day and use less than the *start* of the next day (UTC)
              end.setUTCHours(0, 0, 0, 0)
              end.setUTCDate(end.getUTCDate() + 1)
              conditions.push(lte(schema.timeEntries.startTime, end))
            } catch (e) {
              console.error("Invalid endDate format:", endDate, e)
              return error(400, "Invalid endDate format. Use ISO 8601.")
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
            .where(and(...conditions)) // Apply all conditions
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
          }),
        }
      )
      // READ Single Time Entry
      .get(
        "/id/:id",
        async ({ db, params, error, getUser }) => {
          const user = await getUser()
          if (!user) {
            return error(401, "Unauthorized")
          }

          const entryId = Number(params.id) // Parse ID to number
          if (isNaN(entryId)) {
            return error(400, "Invalid time entry ID format")
          }

          const timeEntry = await db.query.timeEntries.findFirst({
            where: eq(schema.timeEntries.id, entryId), // Use numeric ID
          })

          if (!timeEntry) {
            return error(404, "Time entry not found")
          }

          // Authorization check: User must own the entry OR be an admin
          if (timeEntry.userId !== user.userId && user.role !== "admin") {
            return error(403, "Forbidden: You do not own this time entry")
          }

          return timeEntry
        },
        {
          params: t.Object({
            id: t.Numeric(),
          }),
          detail: {
            summary: "Get a single time entry by ID",
            tags: ["TimeEntries"],
          },
        }
      )
      // UPDATE Time Entry
      .put(
        "/id/:id",
        async ({ db, params, body, error, getUser }) => {
          const user = await getUser()
          if (!user) {
            return error(401, "Unauthorized")
          }

          const entryId = Number(params.id) // Parse ID to number
          if (isNaN(entryId)) {
            return error(400, "Invalid time entry ID format")
          }

          // 1. Find the existing entry first to check ownership
          const existingEntry = await db.query.timeEntries.findFirst({
            where: eq(schema.timeEntries.id, entryId), // Use numeric ID
            columns: { id: true, userId: true }, // Only fetch necessary columns
          })

          if (!existingEntry) {
            return error(404, "Time entry not found")
          }

          // 2. Authorization check: Only the owner can update their entry
          if (existingEntry.userId !== user.userId) {
            // Admins typically shouldn't modify others' time entries directly
            // If admin override is needed, add `&& user.role !== "admin"` check here
            return error(403, "Forbidden: You cannot update this time entry")
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
                // NOTE: `updatedAt` is not in the schema, so not updated here.
              })
              .where(eq(schema.timeEntries.id, entryId)) // Use numeric ID
              .returning() // Return the updated entry

            if (!updatedEntry || updatedEntry.length === 0) {
              // This case might be redundant due to the initial findFirst check,
              // but good for robustness.
              return error(500, "Failed to update time entry")
            }

            return updatedEntry[0]
          } catch (e) {
            console.error(`Failed to update time entry ${entryId}:`, e)
            // Handle potential foreign key constraint errors if projectId is invalid
            if (
              e instanceof Error &&
              e.message.includes("violates foreign key constraint")
            ) {
              return error(400, `Invalid projectId: ${body.projectId}`)
            }
            return error(500, "Internal Server Error")
          }
        },
        {
          params: t.Object({
            id: t.Numeric(),
          }),
          body: t.Object({
            projectId: t.Optional(t.Numeric()),
            startTime: t.Optional(t.Date()),
            endTime: t.Optional(t.Date()),
            durationSeconds: t.Optional(t.Integer()),
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
        async ({ db, params, error, getUser }) => {
          const user = await getUser()
          if (!user) {
            return error(401, "Unauthorized")
          }

          const entryId = Number(params.id) // Parse ID to number
          if (isNaN(entryId)) {
            return error(400, "Invalid time entry ID format")
          }

          // 1. Find the existing entry first to check ownership
          const existingEntry = await db.query.timeEntries.findFirst({
            where: eq(schema.timeEntries.id, entryId), // Use numeric ID
            columns: { id: true, userId: true }, // Only fetch necessary columns
          })

          if (!existingEntry) {
            return error(404, "Time entry not found")
          }

          // 2. Authorization check: Only the owner can delete their entry
          if (existingEntry.userId !== user.userId) {
            // Admins typically shouldn't delete others' time entries directly
            // If admin override is needed, add `&& user.role !== "admin"` check here
            return error(403, "Forbidden: You cannot delete this time entry")
          }

          // 3. Perform the deletion
          try {
            const deletedEntry = await db
              .delete(schema.timeEntries)
              .where(eq(schema.timeEntries.id, entryId)) // Use numeric ID
              .returning({ id: schema.timeEntries.id }) // Return the id of the deleted item

            if (!deletedEntry || deletedEntry.length === 0) {
              return error(500, "Failed to delete time entry")
            }

            return deletedEntry[0]
          } catch (e) {
            console.error(`Failed to delete time entry ${entryId}:`, e)
            // Handle potential DB errors if necessary
            return error(500, "Internal Server Error")
          }
        },
        {
          params: t.Object({
            id: t.Numeric(),
          }),
          detail: {
            summary: "Delete a time entry by ID",
            tags: ["TimeEntries"],
          },
        }
      )
)
