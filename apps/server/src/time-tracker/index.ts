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
            const activeSessions = await db.query.activeTimerSessions.findMany({
              where: eq(schema.activeTimerSessions.userId, user.userId),
            })

            if (!activeSessions || activeSessions.length === 0) {
              return { hasActiveSessions: false, sessions: [] }
            }

            // Calculate current elapsed time for each session based on server timestamps
            const now = dayjs()
            const sessionsWithElapsed = activeSessions.map((session) => {
              let currentElapsed = session.totalAccumulatedDuration

              if (
                session.status === "running" &&
                session.lastIntervalStartTime
              ) {
                // Add time elapsed in current running interval
                const intervalElapsed = now.diff(
                  dayjs(session.lastIntervalStartTime),
                  "second"
                )
                currentElapsed += intervalElapsed
              }

              return {
                id: session.id,
                status: session.status,
                startTime: session.startTime,
                totalAccumulatedDuration: session.totalAccumulatedDuration,
                currentElapsedTotal: currentElapsed,
                lastIntervalStartTime: session.lastIntervalStartTime,
                description: session.description,
              }
            })

            return {
              hasActiveSessions: true,
              sessions: sessionsWithElapsed,
            }
          } catch (e) {
            logError(`Failed to fetch active timer sessions: ${e}`)
            return status(500, "Internal Server Error")
          }
        },
        {
          detail: {
            summary: "Get all active timer sessions for the logged-in user",
            tags: ["Timer"],
          },
        }
      )
      .post(
        "/start",
        async ({ db, getUser, status, body }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const now = dayjs().toDate()

            // Always create a new session (removed single session restriction)
            const newSession = await db
              .insert(schema.activeTimerSessions)
              .values({
                userId: user.userId,
                status: "running",
                startTime: now,
                totalAccumulatedDuration: 0,
                lastIntervalStartTime: now,
                description: body?.description || null,
              })
              .returning()

            return {
              action: "started",
              session: newSession[0],
            }
          } catch (e) {
            logError(`Failed to start timer session: ${e}`)
            return status(500, "Internal Server Error")
          }
        },
        {
          body: t.Optional(
            t.Object({
              description: t.Optional(t.String()),
            })
          ),
          detail: {
            summary: "Start a new timer session",
            tags: ["Timer"],
          },
        }
      )
      .post(
        "/pause/:sessionId",
        async ({ db, getUser, status, params }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const now = dayjs()

            // Find the specific active running session
            const activeSession = await db.query.activeTimerSessions.findFirst({
              where: and(
                eq(schema.activeTimerSessions.userId, user.userId),
                eq(schema.activeTimerSessions.id, params.sessionId),
                eq(schema.activeTimerSessions.status, "running")
              ),
            })

            if (!activeSession) {
              return status(
                404,
                "No active running timer session found with that ID"
              )
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
          params: t.Object({
            sessionId: t.String(),
          }),
          detail: {
            summary: "Pause a specific active timer session",
            tags: ["Timer"],
          },
        }
      )
      .post(
        "/resume/:sessionId",
        async ({ db, getUser, status, params }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const now = dayjs().toDate()

            // Find the specific paused session
            const pausedSession = await db.query.activeTimerSessions.findFirst({
              where: and(
                eq(schema.activeTimerSessions.userId, user.userId),
                eq(schema.activeTimerSessions.id, params.sessionId),
                eq(schema.activeTimerSessions.status, "paused")
              ),
            })

            if (!pausedSession) {
              return status(404, "No paused timer session found with that ID")
            }

            // Resume the session
            const updatedSession = await db
              .update(schema.activeTimerSessions)
              .set({
                status: "running",
                lastIntervalStartTime: now,
                updatedAt: now,
              })
              .where(eq(schema.activeTimerSessions.id, pausedSession.id))
              .returning()

            return {
              action: "resumed",
              session: updatedSession[0],
            }
          } catch (e) {
            logError(`Failed to resume timer session: ${e}`)
            return status(500, "Internal Server Error")
          }
        },
        {
          params: t.Object({
            sessionId: t.String(),
          }),
          detail: {
            summary: "Resume a specific paused timer session",
            tags: ["Timer"],
          },
        }
      )
      .delete(
        "/:sessionId",
        async ({ db, getUser, status, params }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const now = dayjs()

            // Find the specific active session
            const activeSession = await db.query.activeTimerSessions.findFirst({
              where: and(
                eq(schema.activeTimerSessions.userId, user.userId),
                eq(schema.activeTimerSessions.id, params.sessionId)
              ),
            })

            if (!activeSession) {
              return status(404, "No timer session found with that ID")
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
          params: t.Object({
            sessionId: t.String(),
          }),
          detail: {
            summary: "End a specific timer session and return final duration",
            tags: ["Timer"],
          },
        }
      )
      .post(
        "/sync/:sessionId",
        async ({ db, getUser, status, body, params }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            // Find the specific active session
            const activeSession = await db.query.activeTimerSessions.findFirst({
              where: and(
                eq(schema.activeTimerSessions.userId, user.userId),
                eq(schema.activeTimerSessions.id, params.sessionId)
              ),
            })

            if (!activeSession) {
              return status(404, "No timer session found with that ID")
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
          params: t.Object({
            sessionId: t.String(),
          }),
          body: t.Object({
            description: t.Optional(t.String()),
          }),
          detail: {
            summary:
              "Sync specific timer session (update description, get current state)",
            tags: ["Timer"],
          },
        }
      )
      // Legacy endpoint for backward compatibility - ends all active sessions
      .delete(
        "/active",
        async ({ db, getUser, status }) => {
          const user = await getUser()
          if (!user) {
            return status(401, "Unauthorized")
          }

          try {
            const now = dayjs()

            // Find all active sessions
            const activeSessions = await db.query.activeTimerSessions.findMany({
              where: eq(schema.activeTimerSessions.userId, user.userId),
            })

            if (!activeSessions || activeSessions.length === 0) {
              return status(404, "No active timer sessions found")
            }

            const endedSessions = []

            // End all active sessions
            for (const session of activeSessions) {
              // Calculate final duration
              let finalDuration = session.totalAccumulatedDuration

              if (
                session.status === "running" &&
                session.lastIntervalStartTime
              ) {
                // Add time from the final running interval
                const finalIntervalDuration = now.diff(
                  dayjs(session.lastIntervalStartTime),
                  "second"
                )
                finalDuration += finalIntervalDuration
              }

              // Delete the active session
              const deletedSession = await db
                .delete(schema.activeTimerSessions)
                .where(eq(schema.activeTimerSessions.id, session.id))
                .returning()

              endedSessions.push({
                sessionId: session.id,
                finalDuration,
                startTime: session.startTime,
                endTime: now.toDate(),
                session: deletedSession[0],
              })
            }

            return {
              action: "ended_all",
              endedSessions,
              totalSessions: endedSessions.length,
            }
          } catch (e) {
            logError(`Failed to end all timer sessions: ${e}`)
            return status(500, "Internal Server Error")
          }
        },
        {
          detail: {
            summary: "End all active timer sessions and return final durations",
            tags: ["Timer"],
          },
        }
      )
)
