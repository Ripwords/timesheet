import { baseApp } from "../../utils/baseApp"
import { authGuard } from "../middleware/authGuard"
import { systemSettings } from "../db/schema"
import { eq } from "drizzle-orm"

export const adminSettingsRoutes = baseApp("adminSettings").group(
  "/admin/settings",
  (app) =>
    app
      .use(authGuard("admin"))
      .get("/", async ({ db }) => {
        // Fetch timer reminder settings
        const settings = await db
          .select()
          .from(systemSettings)
          .where(eq(systemSettings.key, "timer_reminder_time"))
        const enabled = await db
          .select()
          .from(systemSettings)
          .where(eq(systemSettings.key, "timer_reminder_enabled"))
        return {
          timerReminderTime: settings[0]?.value ?? "18:00",
          enableTimerReminders: enabled[0]?.value === "true",
        }
      })
      .patch("/", async ({ db, body }) => {
        // Update timer reminder settings
        const { timerReminderTime, enableTimerReminders } = body as {
          timerReminderTime?: string
          enableTimerReminders?: boolean
        }
        if (timerReminderTime !== undefined) {
          await db
            .insert(systemSettings)
            .values({
              key: "timer_reminder_time",
              value: timerReminderTime,
              description: "Time of day to send timer reminder emails (HH:mm)",
            })
            .onConflictDoUpdate({
              target: systemSettings.key,
              set: { value: timerReminderTime },
            })
        }
        if (enableTimerReminders !== undefined) {
          await db
            .insert(systemSettings)
            .values({
              key: "timer_reminder_enabled",
              value: enableTimerReminders ? "true" : "false",
              description: "Enable or disable timer reminder emails",
            })
            .onConflictDoUpdate({
              target: systemSettings.key,
              set: { value: enableTimerReminders ? "true" : "false" },
            })
        }
        return { success: true }
      })
)
