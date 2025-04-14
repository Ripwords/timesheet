import { baseApp } from "../../utils/baseApp"

export const authGuard = baseApp("authGuard").resolve(
  { as: "scoped" },
  async ({ jwt, cookie, error }) => {
    const profile = await jwt.verify(cookie.auth.value)

    if (!profile) {
      return error(401, "Unauthorized")
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
