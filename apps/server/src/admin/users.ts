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

const updateUserBodySchema = t.Object({
  email: t.Optional(t.String({ format: "email" })),
  department: t.Optional(t.UnionEnum(departmentEnumDef)),
  emailVerified: t.Optional(
    t.Boolean({
      error: {
        message: "Email verified must be a boolean",
      },
    })
  ),
})

const userIdParamsSchema = t.Object({
  id: t.Numeric(),
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
      .patch(
        "/:id",
        async ({ db, params, body }) => {
          const userId = params.id
          const { email, department, emailVerified } = body

          if (!email && !department && !emailVerified) {
            throw error(
              400,
              "No update data provided. Provide email or department."
            )
          }

          const updateData: Partial<{
            email: string
            department: (typeof departmentEnumDef)[number]
            emailVerified: boolean
            updatedAt: Date
          }> = {
            updatedAt: new Date(), // Always update the timestamp
          }
          if (email) {
            // Optional: Check if email already exists for another user
            const existingUser = await db.query.users.findFirst({
              where: eq(users.email, email),
            })
            if (existingUser && existingUser.id !== userId) {
              throw error(
                409,
                `Email "${email}" is already in use by another user.`
              )
            }
            updateData.email = email
          }
          if (department) {
            // Basic validation already done by schema, but double check just in case
            if (!departmentEnumDef.includes(department)) {
              throw error(400, `Invalid department value: ${department}`)
            }
            updateData.department = department
          }

          if (emailVerified) {
            updateData.emailVerified = emailVerified
          }

          try {
            const updatedUser = await db
              .update(users)
              .set(updateData)
              .where(eq(users.id, userId))
              .returning({
                id: users.id,
                email: users.email,
                department: users.department,
                emailVerified: users.emailVerified,
                updatedAt: users.updatedAt,
              })

            if (!updatedUser || updatedUser.length === 0) {
              throw error(404, `User with ID ${userId} not found.`)
            }

            return updatedUser[0] // Return the first (and only) updated user record
          } catch (e) {
            console.error(`Error updating user ${userId}:`, e)
            if (
              e instanceof Error &&
              "status" in e &&
              typeof e.status === "number"
            ) {
              // Re-throw specific errors
              throw e
            }
            const message =
              e instanceof Error ? e.message : "Unknown error occurred"
            throw error(500, `Failed to update user: ${message}`)
          }
        },
        {
          detail: {
            summary: "Update User Details (Admin)",
            description:
              "Updates a user's email and/or department. Requires admin privileges.",
            tags: ["Admin", "Users"],
          },
          params: userIdParamsSchema,
          body: updateUserBodySchema,
        }
      )
)
