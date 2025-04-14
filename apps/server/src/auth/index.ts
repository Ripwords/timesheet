import { baseApp } from "../../utils/baseApp"
import bcrypt from "bcryptjs"
import * as schema from "../db/schema"
import { t } from "elysia"
import { sendEmail } from "../../utils/mail"
import crypto from "crypto"
import { eq, and, isNotNull } from "drizzle-orm"

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
      async ({ db, body, error, set }) => {
        const { email, password } = body

        const allowedDomains = process.env.SIGNUP_DOMAINS?.split(",")
        if (!allowedDomains?.includes(email.split("@")[1])) {
          return error(400, "Invalid email domain.")
        }

        const existingUser = await db.query.users.findFirst({
          where: (users, { eq, and, isNotNull }) =>
            and(eq(users.email, email), isNotNull(users.emailVerified)),
        })

        if (existingUser && existingUser.emailVerified) {
          return error(409, "User with this email already verified.")
        }

        const passwordHash = await bcrypt.hash(password, 10)
        const verificationToken = crypto.randomBytes(32).toString("hex")
        const verificationTokenHash = await bcrypt.hash(verificationToken, 10)

        try {
          const newUser = await db
            .insert(schema.users)
            .values({
              email: email,
              passwordHash: passwordHash,
              verificationToken: verificationTokenHash,
            })
            .returning({ id: schema.users.id, email: schema.users.email })

          const verificationUrl = `${process.env.DASHBOARD_URL}/verify-email/${verificationToken}`
          const message = `Welcome! Please verify your email by clicking this link: ${verificationUrl}`
          console.log(message)
          await sendEmail(email, "Verify Your Email", message)

          set.status = 201
          return {
            message:
              "User created. Please check your email to verify your account.",
            user: newUser[0],
          }
        } catch (e: any) {
          if (
            e.message?.includes(
              'duplicate key value violates unique constraint "users_email_key"'
            )
          ) {
            return error(409, "User with this email already exists.")
          }
          console.error("Signup Error:", e)
          return error(500, "Failed to create user.")
        }
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

        if (!user.emailVerified) {
          return error(403, "Please verify your email before signing in.")
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
    .get(
      "/verify-email/:token",
      async ({ db, params, error, set }) => {
        const { token } = params

        const usersToCheck = await db.query.users.findMany({
          where: (users) =>
            and(
              eq(users.emailVerified, false),
              isNotNull(users.verificationToken)
            ),
          columns: { id: true, verificationToken: true },
        })

        let foundUser = null
        for (const user of usersToCheck) {
          if (
            user.verificationToken &&
            (await bcrypt.compare(token, user.verificationToken))
          ) {
            foundUser = user
            break
          }
        }

        if (!foundUser || !foundUser.verificationToken) {
          return error(400, "Verification token is invalid or has expired.")
        }

        await db
          .update(schema.users)
          .set({
            emailVerified: true,
            verificationToken: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, foundUser.id))

        set.status = 200
        return { message: "Email verified successfully." }
      },
      {
        params: t.Object({
          token: t.String(),
        }),
      }
    )
)
