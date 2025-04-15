import { auth } from "./auth"
import { baseApp } from "../utils/baseApp"
import { projects } from "./projects"
import { timeEntries } from "./time-entries"
import { Logestic } from "logestic"

const app = baseApp("main")
  .use(Logestic.preset("fancy"))
  .use(auth)
  .use(projects)
  .use(timeEntries)
  .get("/", () => "Hello Elysia")
  .listen(process.env.SERVER_PORT || 3100)

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)

export type App = typeof app
