import { auth } from "./auth"
import { baseApp } from "../utils/baseApp"
import { projects } from "./projects"
import { timeEntries } from "./time-entries"
import { adminReportsRoutes } from "./admin/reports"
import { adminUsersRoutes } from "./admin/users"
import { adminDepartmentsRoutes } from "./admin/departments"
import { adminFinancials } from "./admin/financials"
import { publicDepartmentsRoutes } from "./departments"
import { Elysia } from "elysia"
import { timeTracker } from "./time-tracker"
import { generateMonthlySummaries } from "./cron/generateMonthlySummaries"
import { db } from "../utils/baseApp"

const app = new Elysia()
  .use(baseApp("main"))
  .group("/api", (app) =>
    app
      .use(auth)
      .use(projects)
      .use(timeEntries)
      .use(adminReportsRoutes)
      .use(adminUsersRoutes)
      .use(adminDepartmentsRoutes)
      .use(publicDepartmentsRoutes)
      .use(adminFinancials)
      .use(timeTracker)
  )
  .get("/", () => "Hello Elysia - Timesheet Backend")
  .listen(process.env.SERVER_PORT || 3100)

// Kick off monthly summary generation once on startup and schedule daily run at 01:15 UTC
;(async () => {
  try {
    await generateMonthlySummaries(db)
  } catch (err) {
    console.error("Failed to run initial monthly summary generation", err)
  }

  // Run every 24h (86_400_000 ms)
  setInterval(async () => {
    try {
      await generateMonthlySummaries(db)
    } catch (err) {
      console.error("Scheduled monthly summary generation failed", err)
    }
  }, 86_400_000)
})()

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)

export type App = typeof app
