import { Elysia, t } from "elysia"

import { swagger } from "@elysiajs/swagger"
import { serverTiming } from "@elysiajs/server-timing"
import { cors } from "@elysiajs/cors"
import { jwt } from "@elysiajs/jwt"
import { cookie } from "@elysiajs/cookie"

import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"

import * as schema from "../src/db/schema"
import * as dotenv from "dotenv"
import { logger } from "@rasla/logify"

dotenv.config({ path: "../../.env" })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.")
}

const client = postgres(connectionString)
const db = drizzle(client, { schema })

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set.")
}

export const baseApp = (name: string) =>
  new Elysia({
    name,
  })
    .use(
      logger({
        level: "debug",
      })
    )
    .use(serverTiming())
    .decorate("db", db)
    .use(
      cors({
        origin: process.env.DASHBOARD_URL ?? "http://localhost:5173",
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    )
    .use(cookie())
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
