import { baseApp } from "../../utils/baseApp"
import { users } from "../db/schema"

type UserRole = (typeof users.$inferSelect)["role"]

export const authGuard = (role: UserRole = "user") =>
  baseApp("authGuard").resolve(
    { as: "scoped" },
    async ({ jwt, cookie, error }) => {
      const profile = await jwt.verify(cookie.auth.value)

      if (!profile) {
        return error(401, "Unauthorized")
      }

      if (role !== profile.role && profile.role !== "admin") {
        return error(403, "Forbidden")
      }

      return {
        async getUser() {
          const authCookie = cookie.auth
          if (!authCookie?.value) {
            return null
          }
          const profile = await jwt.verify(authCookie.value)
          if (!profile) {
            return null
          }
          return profile
        },
      }
    }
  )
