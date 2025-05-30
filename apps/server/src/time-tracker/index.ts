import { eq, and } from "drizzle-orm"
import { t } from "elysia"
import { baseApp } from "../../utils/baseApp"
import * as schema from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { error as logError } from "@rasla/logify"
import dayjs from "dayjs"

export const timeTracker = baseApp("time-tracker").group(
  "/time-tracker",
  (app) =>
    app
      .use(authGuard())
      .get(
        "/active",
        async ({ db, getUser, status }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const activeSession = await db.query.activeTimerSessions.findFirst({
              where: eq(schema.activeTimerSessions.userId, user.userId),
            })

            if (!activeSession) {
              return { hasActiveSession: false, session: null }
            }

            // Calculate current elapsed time based on server timestamps
            const now = dayjs()
            let currentElapsed = activeSession.totalAccumulatedDuration

            if (
              activeSession.status === "running" &&
              activeSession.lastIntervalStartTime
            ) {
              // Add time elapsed in current running interval
              const intervalElapsed = now.diff(
                dayjs(activeSession.lastIntervalStartTime),
                "second"
              )
              currentElapsed += intervalElapsed
            }

            return {
              hasActiveSession: true,
              session: {
                id: activeSession.id,
                status: activeSession.status,
                startTime: activeSession.startTime,
                totalAccumulatedDuration:
                  activeSession.totalAccumulatedDuration,
                currentElapsedTotal: currentElapsed,
                lastIntervalStartTime: activeSession.lastIntervalStartTime,
                description: activeSession.description,
              },
            }
          } catch (e) {
            logError(`Failed to fetch active timer session: ${e}`)
            return status(500, "Internal Server Error")
          }
        },
        {
          detail: {
            summary: "Get active timer session for the logged-in user",
            tags: ["Timer"],
          },
        }
      )
      .post(
        "/start",
        async ({ db, getUser, status }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const now = dayjs().toDate()

            // Check if user already has an active session
            const existingSession =
              await db.query.activeTimerSessions.findFirst({
                where: eq(schema.activeTimerSessions.userId, user.userId),
              })

            if (existingSession) {
              // Resume existing session if it's paused, or return current if running
              if (existingSession.status === "paused") {
                const updatedSession = await db
                  .update(schema.activeTimerSessions)
                  .set({
                    status: "running",
                    lastIntervalStartTime: now,
                    updatedAt: now,
                  })
                  .where(eq(schema.activeTimerSessions.id, existingSession.id))
                  .returning()

                return {
                  action: "resumed",
                  session: updatedSession[0],
                }
              } else {
                // Already running
                return {
                  action: "already_running",
                  session: existingSession,
                }
              }
            } else {
              // Create new session
              const newSession = await db
                .insert(schema.activeTimerSessions)
                .values({
                  userId: user.userId,
                  status: "running",
                  startTime: now,
                  totalAccumulatedDuration: 0,
                  lastIntervalStartTime: now,
                })
                .returning()

              return {
                action: "started",
                session: newSession[0],
              }
            }
          } catch (e) {
            logError(`Failed to start timer session: ${e}`)
            return status(500, "Internal Server Error")
          }
        },
        {
          detail: {
            summary: "Start a new timer session or resume a paused one",
            tags: ["Timer"],
          },
        }
      )
      .post(
        "/pause",
        async ({ db, getUser, status }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const now = dayjs()

            // Find the active running session
            const activeSession = await db.query.activeTimerSessions.findFirst({
              where: and(
                eq(schema.activeTimerSessions.userId, user.userId),
                eq(schema.activeTimerSessions.status, "running")
              ),
            })

            if (!activeSession) {
              return status(404, "No active running timer session found")
            }

            // Calculate the duration of the current interval and add to total
            let newTotalDuration = activeSession.totalAccumulatedDuration

            if (activeSession.lastIntervalStartTime) {
              const intervalDuration = now.diff(
                dayjs(activeSession.lastIntervalStartTime),
                "second"
              )
              newTotalDuration += intervalDuration
            }

            // Update session to paused status
            const updatedSession = await db
              .update(schema.activeTimerSessions)
              .set({
                status: "paused",
                totalAccumulatedDuration: newTotalDuration,
                lastIntervalStartTime: null, // Clear when paused
                updatedAt: now.toDate(),
              })
              .where(eq(schema.activeTimerSessions.id, activeSession.id))
              .returning()

            return {
              action: "paused",
              session: updatedSession[0],
              totalElapsed: newTotalDuration,
            }
          } catch (e) {
            logError(`Failed to pause timer session: ${e}`)
            return status(500, "Internal Server Error")
          }
        },
        {
          detail: {
            summary: "Pause the active timer session",
            tags: ["Timer"],
          },
        }
      )
      .delete(
        "/active",
        async ({ db, getUser, status }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const now = dayjs()

            // Find the active session
            const activeSession = await db.query.activeTimerSessions.findFirst({
              where: eq(schema.activeTimerSessions.userId, user.userId),
            })

            if (!activeSession) {
              return status(404, "No active timer session found")
            }

            // Calculate final duration
            let finalDuration = activeSession.totalAccumulatedDuration

            if (
              activeSession.status === "running" &&
              activeSession.lastIntervalStartTime
            ) {
              // Add time from the final running interval
              const finalIntervalDuration = now.diff(
                dayjs(activeSession.lastIntervalStartTime),
                "second"
              )
              finalDuration += finalIntervalDuration
            }

            // Delete the active session
            const deletedSession = await db
              .delete(schema.activeTimerSessions)
              .where(eq(schema.activeTimerSessions.id, activeSession.id))
              .returning()

            return {
              action: "ended",
              finalDuration,
              startTime: activeSession.startTime,
              endTime: now.toDate(),
              session: deletedSession[0],
            }
          } catch (e) {
            logError(`Failed to end timer session: ${e}`)
            return status(500, "Internal Server Error")
          }
        },
        {
          detail: {
            summary: "End the active timer session and return final duration",
            tags: ["Timer"],
          },
        }
      )
      .post(
        "/sync",
        async ({ db, getUser, status, body }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            // Find the active session
            const activeSession = await db.query.activeTimerSessions.findFirst({
              where: eq(schema.activeTimerSessions.userId, user.userId),
            })

            if (!activeSession) {
              return status(404, "No active timer session found")
            }

            // Update description if provided
            if (body.description !== undefined) {
              await db
                .update(schema.activeTimerSessions)
                .set({
                  description: body.description,
                  updatedAt: new Date(),
                })
                .where(eq(schema.activeTimerSessions.id, activeSession.id))
            }

            // Calculate current elapsed time for response
            const now = dayjs()
            let currentElapsed = activeSession.totalAccumulatedDuration

            if (
              activeSession.status === "running" &&
              activeSession.lastIntervalStartTime
            ) {
              const intervalElapsed = now.diff(
                dayjs(activeSession.lastIntervalStartTime),
                "second"
              )
              currentElapsed += intervalElapsed
            }

            return {
              action: "synced",
              currentElapsedTotal: currentElapsed,
              status: activeSession.status,
            }
          } catch (e) {
            logError(`Failed to sync timer session: ${e}`)
            return status(500, "Internal Server Error")
          }
        },
        {
          body: t.Object({
            description: t.Optional(t.String()),
          }),
          detail: {
            summary:
              "Sync timer session (update description, get current state)",
            tags: ["Timer"],
          },
        }
      )
)
