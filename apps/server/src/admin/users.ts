import { error } from "elysia"
import { baseApp } from "../../utils/baseApp"
import { users } from "../db/schema"
import { checkAdmin } from "../middleware/auth"

export const adminUsersRoutes = baseApp("adminUsers").group(
  "/admin/users",
  (app) =>
    app
      .onBeforeHandle(checkAdmin) // Protect all routes in this group
      .get(
        "/", // Corresponds to eden.api.admin.users.index.get()
        async ({ db: contextDb }) => {
          // Ensure db is available on context
          if (!contextDb) {
            console.error(
              "Database connection not found on context in adminUsersRoutes"
            )
            throw error(
              500,
              "Server configuration error: Database connection missing."
            )
          }

          try {
            // Fetch all users, selecting only necessary fields
            const userList = await contextDb
              .select({
                id: users.id,
                email: users.email,
                role: users.role,
                emailVerified: users.emailVerified,
                createdAt: users.createdAt,
                // IMPORTANT: Do NOT select passwordHash or verificationToken
              })
              .from(users)

            return userList
          } catch (e) {
            console.error("Error fetching user list for admin:", e)
            const message =
              e instanceof Error ? e.message : "Unknown error occurred"
            throw error(500, `Failed to fetch user list: ${message}`)
          }
        },
        {
          detail: {
            summary: "Get list of all users (Admin)",
            description:
              "Fetches a complete list of registered users. Requires admin privileges.",
            tags: ["Admin", "Users"],
          },
          // Response validation could be added here if desired
          // response: t.Array(t.Object({ ... define user fields ... }))
        }
      )
  // Add other admin user management endpoints here (e.g., update role, delete user)
)
