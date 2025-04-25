import { error, t } from "elysia"
import { baseApp } from "../../utils/baseApp"
import { users } from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { eq } from "drizzle-orm"
export const adminUsersRoutes = baseApp("adminUsers").group(
  "/admin/users",
  (app) =>
    app
      .use(authGuard("admin"))
      .get(
        "/", // Corresponds to eden.api.admin.users.index.get()
        async ({ db }) => {
          try {
            // Fetch all users, selecting only necessary fields
            const userList = await db
              .select({
                id: users.id,
                email: users.email,
                role: users.role,
                emailVerified: users.emailVerified,
                department: users.department,
                createdAt: users.createdAt,
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
        }
      )
      .get(
        "/user/:id",
        async ({ db, params }) => {
          const userId = params.id
          const user = await db.query.users.findFirst({
            where: eq(users.id, Number(userId)),
          })
          return user
        },
        {
          detail: {
            summary: "Get user by ID (Admin)",
            description:
              "Fetches a user by their ID. Requires admin privileges.",
            tags: ["Admin", "Users"],
          },
          params: t.Object({
            id: t.String(),
          }),
        }
      )
)
