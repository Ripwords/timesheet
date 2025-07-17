import {
  systemSettings,
  emailNotifications,
  users,
  activeTimerSessions,
} from "../db/schema"
import { eq, and, inArray } from "drizzle-orm"
import dayjs from "dayjs"
import duration from "dayjs/plugin/duration"
import relativeTime from "dayjs/plugin/relativeTime"
dayjs.extend(duration)
dayjs.extend(relativeTime)
import { sendEmail } from "../../utils/mail"

import { cron } from "@elysiajs/cron"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "../db/schema"

type ActiveTimerSession = typeof activeTimerSessions.$inferSelect
type User = typeof users.$inferSelect
type EmailNotification = typeof emailNotifications.$inferSelect

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const db = drizzle(pool, { schema })

export const timerNotificationCron = cron({
  name: "timer-notification-reminder",
  pattern: "*/5 * * * * *",
  run: async () => {
    try {
      // 1. Get system settings for reminder time and enabled flag
      const [enabledSetting] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, "timer_reminder_enabled"))
      if (!enabledSetting || enabledSetting.value !== "true") return // Feature disabled

      // 2. Get today's date (UTC)
      const today = dayjs().utc().format("YYYY-MM-DD")

      // 3. Find users with active timer sessions
      const activeSessions: ActiveTimerSession[] = await db
        .select()
        .from(activeTimerSessions)
      if (!activeSessions.length) return
      const userIds = [...new Set(activeSessions.map((s) => s.userId))]
      if (!userIds.length) return

      // 4. Check which users have already received a reminder today
      const alreadyNotified: EmailNotification[] = await db
        .select()
        .from(emailNotifications)
        .where(
          and(
            eq(emailNotifications.type, "timer_reminder"),
            eq(emailNotifications.date, today)
          )
        )
      const alreadyNotifiedUserIds = new Set(
        alreadyNotified.map((n) => n.userId)
      )

      // 5. For each user with active session and not already notified, send email
      const usersToNotify: string[] = (userIds as string[]).filter(
        (id) => !alreadyNotifiedUserIds.has(id)
      )
      if (!usersToNotify.length) return
      const userRecords: User[] = await db
        .select()
        .from(users)
        .where(inArray(users.id, usersToNotify))

      for (const user of userRecords) {
        const sessions = activeSessions.filter((s) => s.userId === user.id)
        const sessionRows = sessions
          .map((s) => {
            const start = dayjs(s.startTime).format("HH:mm")
            const durationStr = dayjs
              .duration(dayjs().diff(dayjs(s.startTime)))
              .humanize()
            return `<tr><td style="padding:8px;border:1px solid #eee;">${start}</td><td style="padding:8px;border:1px solid #eee;">${durationStr}</td></tr>`
          })
          .join("")
        const emailBody = `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; background: #f9f9f9; color: #222;">
    <div style="max-width: 480px; margin: 32px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); padding: 32px;">
      <h2 style="color: #2d6cdf; margin-top: 0;">Timer Session Reminder</h2>
      <p>Hi <b>${user.email}</b>,</p>
      <p>You have active timer sessions running. Please remember to end your sessions at the end of your work day to ensure accurate time tracking.</p>
      <h3 style="margin-bottom: 8px;">Active Sessions</h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f1f5fa;">
            <th style="padding:8px;border:1px solid #eee;text-align:left;">Started At</th>
            <th style="padding:8px;border:1px solid #eee;text-align:left;">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${sessionRows}
        </tbody>
      </table>
      <p>To end your sessions, please visit the dashboard and click <b>End Session</b> for each active timer.</p>
      <p style="margin-top: 32px; color: #888; font-size: 13px;">Best regards,<br/>Timesheet System</p>
    </div>
  </body>
</html>`
        await sendEmail(
          user.email,
          "Timer Session Reminder - Please End Your Active Sessions",
          emailBody
        )
        // Record notification
        await db.insert(emailNotifications).values({
          userId: user.id,
          type: "timer_reminder",
          sentAt: new Date(),
          date: today,
          createdAt: new Date(),
        })
      }
      console.log("✅ Timer reminder emails processed")
    } catch (error) {
      console.error("❌ Error sending timer reminder emails:", error)
    }
  },
})
