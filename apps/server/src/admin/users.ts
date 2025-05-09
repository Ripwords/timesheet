import { and, count, desc, eq, ilike, ne, sql } from "drizzle-orm"
import { error, t } from "elysia"
import { baseApp } from "../../utils/baseApp"
import { departments, timeEntries, users } from "../db/schema"
import { authGuard } from "../middleware/authGuard"
import { UUID } from "../../utils/validtors"
import { error as logError } from "@rasla/logify"
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
  departmentId: t.Optional(UUID),
  status: t.Optional(t.UnionEnum(["active", "inactive"])),
})

const updateUserBodySchema = t.Object({
  email: t.Optional(t.String({ format: "email" })),
  departmentId: t.Optional(UUID),
  ratePerHour: t.Optional(t.Number({ minimum: 0 })),
  emailVerified: t.Optional(
    t.Boolean({
      error: {
        message: "Email verified must be a boolean",
      },
    })
  ),
})

const userIdParamsSchema = t.Object({
  id: UUID,
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
            const { page = 1, limit = 10, search, departmentId, status } = query
            const offset = (page - 1) * limit

            const whereConditions = []
            if (search && search !== "") {
              whereConditions.push(ilike(users.email, `%${search}%`))
            }
            if (departmentId) {
              whereConditions.push(eq(users.departmentId, departmentId))
            }
            if (status) {
              whereConditions.push(eq(users.accountStatus, status))
            }

            const startOfWeek = sql`date_trunc('week', current_timestamp)`
            const endOfWeek = sql`date_trunc('week', current_timestamp) + interval '1 week'`

            const userListQuery = db
              .select({
                id: users.id,
                email: users.email,
                role: users.role,
                emailVerified: users.emailVerified,
                ratePerHour: users.ratePerHour,
                accountStatus: users.accountStatus,
                departmentId: users.departmentId,
                departmentName: departments.name,
                createdAt: users.createdAt,
                totalSecondsThisWeek: sql<number>`(
                  SELECT coalesce(sum(${timeEntries.durationSeconds}), 0)
                  FROM ${timeEntries}
                  WHERE ${timeEntries.userId} = ${users.id}
                  AND ${timeEntries.startTime} >= ${startOfWeek}
                  AND ${timeEntries.startTime} < ${endOfWeek}
                )`,
              })
              .from(users)
              .innerJoin(departments, eq(users.departmentId, departments.id))
              .orderBy(desc(users.createdAt))
              .limit(limit)
              .offset(offset)

            if (whereConditions.length > 0) {
              userListQuery.where(and(...whereConditions))
            }

            const userListRaw = await userListQuery

            if (userListRaw.length === 0) {
              const totalQuery = db.select({ count: count() }).from(users)
              if (whereConditions.length > 0) {
                totalQuery.where(and(...whereConditions))
              }
              const totalResult = await totalQuery
              return {
                users: [],
                total: totalResult[0]?.count ?? 0,
              }
            }

            const userListFormatted = userListRaw.map((user) => {
              const { totalSecondsThisWeek, ...rest } = user
              return {
                ...rest,
                totalHoursThisWeek: totalSecondsThisWeek / 3600,
              }
            })

            const totalQuery = db.select({ count: count() }).from(users)
            if (whereConditions.length > 0) {
              totalQuery.where(and(...whereConditions))
            }
            const totalResult = await totalQuery

            return {
              users: userListFormatted,
              total: totalResult[0]?.count ?? 0,
            }
          } catch (e) {
            logError(`Error fetching user list for admin: ${e}`)
            const message =
              e instanceof Error ? e.message : "Unknown error occurred"
            throw error(500, `Failed to fetch user list: ${message}`)
          }
        },
        {
          detail: {
            summary: "Get list of all users (Admin)",
            description:
              "Fetches a list of registered users with department names. Requires admin privileges.",
            tags: ["Admin", "Users"],
          },
          query: querySchema,
        }
      )
      .get(
        "/user/:id",
        async ({ db, params, error }) => {
          const userId = params.id

          const userData = await db
            .select({
              id: users.id,
              email: users.email,
              role: users.role,
              emailVerified: users.emailVerified,
              accountStatus: users.accountStatus,
              verificationToken: users.verificationToken,
              createdAt: users.createdAt,
              updatedAt: users.updatedAt,
              departmentId: users.departmentId,
              departmentName: departments.name,
            })
            .from(users)
            .innerJoin(departments, eq(users.departmentId, departments.id))
            .where(eq(users.id, userId))
            .limit(1)

          const user = userData[0]

          if (!user) {
            return error(404, `User with ID ${userId} not found`)
          }
          return user
        },
        {
          detail: {
            summary: "Get user by ID (Admin)",
            description:
              "Fetches a user by their ID, including department name. Requires admin privileges.",
            tags: ["Admin", "Users"],
          },
          params: t.Object({ id: UUID }),
        }
      )
      .patch(
        "/:id",
        async ({ db, params, body, error }) => {
          const userId = params.id
          const { email, departmentId, ratePerHour, emailVerified } = body

          if (
            email === undefined &&
            departmentId === undefined &&
            ratePerHour === undefined &&
            emailVerified === undefined
          ) {
            return error(
              400,
              "No update data provided. Provide email, departmentId, ratePerHour, or emailVerified."
            )
          }

          if (departmentId !== undefined) {
            const departmentExists = await db.query.departments.findFirst({
              where: eq(departments.id, departmentId),
              columns: { id: true },
            })
            if (!departmentExists) {
              return error(400, `Invalid departmentId: ${departmentId}`)
            }
          }

          const updateData: Partial<
            typeof users.$inferInsert & { updatedAt: Date }
          > = {
            updatedAt: new Date(),
          }
          if (email !== undefined) {
            const existingUser = await db.query.users.findFirst({
              where: and(eq(users.email, email), ne(users.id, userId)),
              columns: { id: true },
            })
            if (existingUser) {
              return error(
                409,
                `Email "${email}" is already in use by another user.`
              )
            }
            updateData.email = email
          }
          if (departmentId !== undefined) {
            updateData.departmentId = departmentId
          }
          if (ratePerHour !== undefined && ratePerHour !== null) {
            updateData.ratePerHour = ratePerHour.toFixed(2)
          } else if (ratePerHour === null) {
            updateData.ratePerHour = "0.00"
          }
          if (emailVerified !== undefined) {
            updateData.emailVerified = emailVerified
          }

          try {
            const updatedUserResult = await db
              .update(users)
              .set(updateData)
              .where(eq(users.id, userId))
              .returning({
                id: users.id,
                email: users.email,
                departmentId: users.departmentId,
                ratePerHour: users.ratePerHour,
                emailVerified: users.emailVerified,
                updatedAt: users.updatedAt,
              })

            if (!updatedUserResult || updatedUserResult.length === 0) {
              return error(404, `User with ID ${userId} not found.`)
            }

            const finalUserData = await db
              .select({
                id: users.id,
                email: users.email,
                departmentId: users.departmentId,
                departmentName: departments.name,
                ratePerHour: users.ratePerHour,
                emailVerified: users.emailVerified,
                updatedAt: users.updatedAt,
              })
              .from(users)
              .innerJoin(departments, eq(users.departmentId, departments.id))
              .where(eq(users.id, updatedUserResult[0].id))
              .limit(1)

            return finalUserData[0]
          } catch (e) {
            logError(`Error updating user ${userId}: ${e}`)
            if (e instanceof Error && e.message.includes("already in use")) {
              return error(409, e.message)
            }
            if (
              e instanceof Error &&
              e.message.includes("Invalid departmentId")
            ) {
              return error(400, e.message)
            }
            const message =
              e instanceof Error ? e.message : "Unknown error occurred"
            return error(500, `Failed to update user: ${message}`)
          }
        },
        {
          detail: {
            summary: "Update User Details (Admin)",
            description:
              "Updates a user's email, departmentId, and/or emailVerified status. Requires admin privileges.",
            tags: ["Admin", "Users"],
          },
          params: userIdParamsSchema,
          body: updateUserBodySchema,
        }
      )
      .patch(
        "/:id/activate",
        async ({ db, params, error }) => {
          const userId = params.id

          try {
            const updatedUserResult = await db
              .update(users)
              .set({ accountStatus: "active", updatedAt: new Date() })
              .where(eq(users.id, userId))
              .returning({
                id: users.id,
                accountStatus: users.accountStatus,
              })

            if (!updatedUserResult || updatedUserResult.length === 0) {
              return error(404, `User with ID ${userId} not found.`)
            }

            return {
              message: `User ${userId} activated successfully.`,
              user: updatedUserResult[0],
            }
          } catch (e) {
            logError(`Error activating user ${userId}: ${e}`)
            const message =
              e instanceof Error ? e.message : "Unknown error occurred"
            return error(500, `Failed to activate user: ${message}`)
          }
        },
        {
          detail: {
            summary: "Activate User (Admin)",
            description:
              "Marks a user's accountStatus as 'active'. Requires admin privileges.",
            tags: ["Admin", "Users"],
          },
          params: userIdParamsSchema,
        }
      )
      .delete(
        "/:id",
        async ({ db, params, error }) => {
          const userId = params.id

          try {
            const updatedUserResult = await db
              .update(users)
              .set({ accountStatus: "inactive", updatedAt: new Date() })
              .where(eq(users.id, userId))
              .returning({
                id: users.id,
                accountStatus: users.accountStatus,
              })

            if (!updatedUserResult || updatedUserResult.length === 0) {
              return error(404, `User with ID ${userId} not found.`)
            }

            return {
              message: `User ${userId} deactivated successfully.`,
              user: updatedUserResult[0],
            }
          } catch (e) {
            logError(`Error deactivating user ${userId}: ${e}`)
            const message =
              e instanceof Error ? e.message : "Unknown error occurred"
            return error(500, `Failed to deactivate user: ${message}`)
          }
        },
        {
          detail: {
            summary: "Deactivate User (Admin)",
            description:
              "Marks a user's accountStatus as 'inactive'. Requires admin privileges.",
            tags: ["Admin", "Users"],
          },
          params: userIdParamsSchema,
        }
      )
)
