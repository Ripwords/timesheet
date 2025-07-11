import { Elysia, t } from "elysia"

import swagger from "@elysiajs/swagger"
import serverTiming from "@elysiajs/server-timing"
import cors from "@elysiajs/cors"
import jwt from "@elysiajs/jwt"

import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"

import * as schema from "../src/db/schema"
import * as dotenv from "dotenv"
import logixlysia from "logixlysia"
import { eq } from "drizzle-orm"

dotenv.config({ path: "../../.env" })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.")
}

const client = postgres(connectionString)
export const db = drizzle(client, { schema })

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set.")
}

const DASHBOARD_ORIGIN = process.env.DASHBOARD_URL ?? "http://localhost:5173"

export const baseApp = (name: string) =>
  new Elysia({
    name,
  })
    .use(logixlysia())
    .use(serverTiming())
    .decorate("db", db)
    .use(
      cors({
        origin: [
          DASHBOARD_ORIGIN,
          DASHBOARD_ORIGIN.replace("http://", ""),
          DASHBOARD_ORIGIN.replace("https://", ""),
        ],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        credentials: true,
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-User-Timezone",
          "x-user-timezone",
        ],
      })
    )
    .use(
      jwt({
        name: "jwt",
        secret: JWT_SECRET,
        exp: "7d",
        schema: t.Object({
          userId: t.String({
            format: "uuid",
          }),
          email: t.String(),
          role: t.String(),
        }),
      })
    )
    .use(swagger())
    .macro({
      adminOnly: () => ({
        resolve: async ({ db, jwt, cookie, error }: { db: any; jwt: any; cookie: any; error: any }): Promise<any> => {
          const profile = await jwt.verify(cookie.auth.value)
          if (!profile) {
            return error(401, "Unauthorized")
          }

          const user = await db.query.users.findFirst({
            where: eq(schema.users.id, profile.userId),
          })

          if (user?.role !== "admin") {
            return error(403, "Forbidden")
          }

          return {
            isAdmin: true,
          }
        },
      }),
    })
