import { baseApp } from "../../utils/baseApp"
import bcrypt from "bcryptjs"
import * as schema from "../db/schema"
import { t } from "elysia"
import { sendEmail } from "../../utils/mail"
import crypto from "crypto"
import { eq } from "drizzle-orm"

export const auth = baseApp("auth").group("/auth", (app) =>
  app
    .derive(({ jwt, cookie }) => {
      return {
        getUser: async () => {
          const authCookie = cookie.auth
          if (!authCookie?.value) {
            return null
          }
          const profile = await jwt.verify(authCookie.value)
          if (!profile) {
            return null
          }
          return profile as { userId: number; email: string }
        },
      }
    })
    .post(
      "/signup",
      async ({ db, body, error }) => {
        const { email, password } = body

        const allowedDomains = process.env.SIGNUP_DOMAINS?.split(",")
        if (!allowedDomains?.includes(email.split("@")[1])) {
          return error(400, "Invalid email domain.")
        }

        const existingUser = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, email),
        })

        if (existingUser) {
          return error(409, "User with this email already exists.")
        }

        const passwordHash = await bcrypt.hash(password, 10)

        const newUser = await db
          .insert(schema.users)
          .values({
            email: email,
            passwordHash: passwordHash,
          })
          .returning({ id: schema.users.id, email: schema.users.email })

        return { message: "User created successfully", user: newUser[0] }
      },
      {
        body: t.Object({
          email: t.String({ format: "email" }),
          password: t.String({ minLength: 8 }),
        }),
      }
    )
    .post(
      "/signin",
      async ({ db, jwt, body, error, cookie }) => {
        const { email, password } = body

        const user = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, email),
        })

        if (!user) {
          return error(401, "Invalid email or password.")
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          user.passwordHash
        )

        if (!isPasswordValid) {
          return error(401, "Invalid email or password.")
        }

        const token = await jwt.sign({
          userId: user.id,
          email: user.email,
          role: user.role,
        })

        cookie.auth.set({
          value: token,
          httpOnly: true,
          maxAge: 7 * 86400,
          path: "/",
        })

        return { message: "Signed in successfully" }
      },
      {
        body: t.Object({
          email: t.String({ format: "email" }),
          password: t.String(),
        }),
      }
    )
    .post("/signout", ({ cookie }) => {
      cookie.auth.remove()
      return { message: "Signed out successfully" }
    })
    .get("/profile", async ({ getUser, error }) => {
      const userProfile = await getUser()

      if (!userProfile) {
        return error(401, "Unauthorized")
      }

      return `Hello ${userProfile.email}! Your user ID is ${userProfile.userId}.`
    })
    .post(
      "/forgot-password",
      async ({ db, body, error, set }) => {
        const { email } = body

        const user = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, email),
        })

        if (!user) {
          // Respond kindly even if the user is not found to prevent email enumeration
          set.status = 200
          return {
            message:
              "If an account with that email exists, a password reset link has been sent.",
          }
        }

        const resetToken = crypto.randomBytes(32).toString("hex")
        const resetTokenHash = await bcrypt.hash(resetToken, 10)
        const resetTokenExpires = new Date(Date.now() + 3600000) // 1 hour expiry

        await db.insert(schema.resetPasswordTokens).values({
          token: resetTokenHash,
          expiresAt: resetTokenExpires,
          userId: user.id,
        })

        const resetUrl = `${process.env.DASHBOARD_URL}/reset-password/${resetToken}`

        const message = `You requested a password reset. Click the link to reset your password: ${resetUrl}\nIf you didn't request this, please ignore this email.`

        try {
          await sendEmail(user.email, "Password Reset Request", message)
          return {
            message:
              "If an account with that email exists, a password reset link has been sent.",
          }
        } catch (emailError) {
          console.error("Failed to send password reset email:", emailError)
          // Optionally, revert the token saving if email fails, or log for retry
          return error(500, "Failed to send password reset email.")
        }
      },
      {
        body: t.Object({
          email: t.String({ format: "email" }),
        }),
      }
    )
    .post(
      "/reset-password",
      async ({ db, body, error }) => {
        const { token, password } = body

        const resetTokenHash = await bcrypt.hash(token, 10)

        const user = await db.query.resetPasswordTokens.findFirst({
          where: (tokens, { eq, and, gt }) =>
            and(
              eq(tokens.token, resetTokenHash),
              gt(tokens.expiresAt, new Date())
            ),
        })

        if (!user) {
          return error(400, "Password reset token is invalid or has expired.")
        }

        const newPasswordHash = await bcrypt.hash(password, 10)

        await db
          .update(schema.users)
          .set({
            passwordHash: newPasswordHash,
            updatedAt: new Date(), // Manually update updatedAt
          })
          .where(eq(schema.users.id, user.id))

        await db
          .delete(schema.resetPasswordTokens)
          .where(eq(schema.resetPasswordTokens.id, user.id))

        return { message: "Password has been reset successfully." }
      },
      {
        body: t.Object({
          token: t.String(),
          password: t.String({ minLength: 8 }),
        }),
      }
    )
)
