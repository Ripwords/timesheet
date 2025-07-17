import bcrypt from "bcryptjs"
import crypto from "crypto"

import { and, eq, isNotNull } from "drizzle-orm"
import { t } from "elysia"

import { baseApp } from "../../utils/baseApp"
import { sendEmail } from "../../utils/mail"
import * as schema from "../db/schema"
import { seedAdminUser } from "../db/seedUser"
import { UUID } from "../../utils/validators"

seedAdminUser()
export const auth = baseApp("auth").group("/auth", (app) =>
  app
    .derive(({ jwt, cookie, db }) => {
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

          const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.id, profile.userId),
            columns: {
              id: true,
              email: true,
              role: true,
              accountStatus: true,
            },
          })

          if (!user || user.accountStatus === "inactive") {
            return null
          }

          return user
        },
      }
    })
    .post(
      "/signup",
      async ({ db, body, status, set }) => {
        const { email, password } = body

        const allowedDomains = process.env.SIGNUP_DOMAINS?.split(",")
        if (!allowedDomains?.includes(email.split("@")[1])) {
          return status(400, `Invalid email domain: ${email.split("@")[1]}`)
        }

        const existingUser = await db.query.users.findFirst({
          where: (users, { eq, and, isNotNull }) =>
            and(eq(users.email, email), isNotNull(users.emailVerified)),
        })

        if (existingUser && existingUser.emailVerified) {
          return status(409, "User with this email already verified.")
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
              departmentId: body.departmentId,
            })
            .returning({ id: schema.users.id, email: schema.users.email })

          const serverUrl = process.env.SERVER_URL
          if (!serverUrl) {
            return status(
              500,
              "Server configuration error: SERVER_URL not set."
            )
          }
          const baseUrl = serverUrl.startsWith("http")
            ? serverUrl
            : `http://${serverUrl}`
          const verificationUrl = new URL(
            `/api/auth/verify-email/${verificationToken}`,
            baseUrl
          ).toString()
          const message = `Welcome! Please verify your email by clicking this link: <a href="${verificationUrl}">Verify Email</a>`

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
            return status(409, "User with this email already exists.")
          }
          return status(500, "Failed to create user.")
        }
      },
      {
        body: t.Object({
          email: t.String({ format: "email" }),
          password: t.String({ minLength: 8 }),
          departmentId: UUID,
        }),
      }
    )
    .post(
      "/signin",
      async ({ db, jwt, body, status, cookie }) => {
        const { email, password } = body

        const user = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, email),
        })

        if (!user) {
          return status(401, "Invalid email or password.")
        }

        if (!user.emailVerified) {
          return status(403, "Please verify your email before signing in.")
        }

        if (user.accountStatus === "inactive") {
          return status(
            403,
            "Your account is inactive. Please contact support."
          )
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          user.passwordHash
        )

        if (!isPasswordValid) {
          return status(401, "Invalid email or password.")
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
          secure: true,
          sameSite: "none",
          priority: "high",
          domain: process.env.DOMAIN,
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
      cookie.auth.domain = process.env.DOMAIN
      return { message: "Signed out successfully" }
    })
    .get("/profile", async ({ getUser, status }) => {
      const userProfile = await getUser()

      if (!userProfile) {
        return status(401, "Unauthorized")
      }

      return userProfile
    })
    .post(
      "/forgot-password",
      async ({ db, body, status, set }) => {
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

        const resetUrl = `${process.env.DASHBOARD_URL}/auth/reset-password/${resetToken}`

        const message = `You requested a password reset. Click the link to reset your password: <a href="${resetUrl}">Reset Password</a>\nIf you didn't request this, please ignore this email.`

        try {
          await sendEmail(user.email, "Password Reset Request", message)
          return {
            message:
              "If an account with that email exists, a password reset link has been sent.",
          }
        } catch {
          return status(500, "Failed to send password reset email.")
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
      async ({ db, body, status }) => {
        const { token: rawToken, password } = body

        const candidateTokens = await db.query.resetPasswordTokens.findMany({
          where: (tokens, { gt }) => gt(tokens.expiresAt, new Date()),
          columns: {
            token: true,
            userId: true,
            id: true,
          },
        })

        let validTokenRecord = null

        for (const candidate of candidateTokens) {
          if (candidate.token) {
            const isMatch = await bcrypt.compare(rawToken, candidate.token)
            if (isMatch) {
              validTokenRecord = candidate
              break
            }
          }
        }

        // 3. Check if a valid token was found
        if (!validTokenRecord) {
          return status(400, "Invalid or expired reset token.")
        }

        // Ensure userId is present on the valid token record
        if (!validTokenRecord.userId) {
          return status(500, "Internal server error during password reset.")
        }

        console.log("Valid token found for user:", validTokenRecord.userId)

        // 4. Hash the new password
        const newPasswordHash = await bcrypt.hash(password, 10)

        // 5. Update the user's password
        await db
          .update(schema.users)
          .set({
            passwordHash: newPasswordHash,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, validTokenRecord.userId))

        // 6. Delete the used reset token
        await db
          .delete(schema.resetPasswordTokens)
          .where(eq(schema.resetPasswordTokens.id, validTokenRecord.id))

        console.log(
          "Password updated successfully for user:",
          validTokenRecord.userId
        )

        return {
          message: "Password reset successfully.",
        }
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
      async ({ db, params, status, set }) => {
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
          return status(400, "Verification token is invalid or has expired.")
        }

        await db
          .update(schema.users)
          .set({
            emailVerified: true,
            verificationToken: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, foundUser.id))

        set.status = 302
        set.headers = {
          Location: `${process.env.DASHBOARD_URL}/auth/login?verifiedEmail=true`,
        }
        return { message: "Redirecting to dashboard." }
      },
      {
        params: t.Object({
          token: t.String(),
        }),
      }
    )
)
