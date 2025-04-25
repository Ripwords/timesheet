import { and, count, desc, eq, ilike } from "drizzle-orm"
import { error, t } from "elysia"
import { baseApp } from "../../utils/baseApp"
import { users } from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { departmentEnumDef } from "@timesheet/constants"

const querySchema = t.Object({
  search: t.Optional(t.Nullable(t.String())),
  page: t.Optional(
    t.Number({
      default: 1,
    })
  ),
  limit: t.Optional(
    t.Number({
      default: 10,
    })
  ),
  department: t.Optional(
    t.UnionEnum(departmentEnumDef, {
      default: undefined,
    })
  ),
})

export const adminUsersRoutes = baseApp("adminUsers").group(
  "/admin/users",
  (app) =>
    app
      .use(authGuard("admin"))
      .get(
        "/",
        async ({ db, query }) => {
          try {
            const { page = 1, limit = 10, search, department } = query
            const offset = (page - 1) * limit

            const whereList = []
            if (search && search !== "") {
              whereList.push(ilike(users.email, `%${search}%`))
            }
            if (department) {
              if (
                departmentEnumDef.includes(
                  department as (typeof departmentEnumDef)[number]
                )
              ) {
                whereList.push(
                  eq(
                    users.department,
                    department as (typeof departmentEnumDef)[number]
                  )
                )
              }
            }

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
              .orderBy(desc(users.createdAt))
              .limit(limit)
              .offset(offset)
              .where(and(...whereList))

            const total = await db
              .select({ count: count() })
              .from(users)
              .where(
                search && search !== ""
                  ? ilike(users.email, `%${search}%`)
                  : undefined
              )

            return {
              users: userList,
              total: total[0]?.count ?? 0,
            }
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
          query: querySchema,
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
