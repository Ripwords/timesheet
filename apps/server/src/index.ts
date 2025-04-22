import { auth } from "./auth"
import { baseApp } from "../utils/baseApp"
import { projects } from "./projects"
import { timeEntries } from "./time-entries"
import { adminReportsRoutes } from "./admin/reports"
import { adminUsersRoutes } from "./admin/users"

const app = baseApp("main")
  .group("/api", (app) =>
    app
      .use(auth)
      .use(projects)
      .use(timeEntries)
      .use(adminReportsRoutes)
      .use(adminUsersRoutes)
  )
  .get("/", () => "Hello Elysia - Timesheet Backend")
  .listen(process.env.SERVER_PORT || 3100)

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)

export type App = typeof app
export * from "./db/schema"
