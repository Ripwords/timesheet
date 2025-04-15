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
    .use(serverTiming())
    .decorate("db", db)
    .use(
      cors({
        origin: "http://localhost:5173",
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
          userId: t.Number(),
          email: t.String(),
          role: t.String(),
        }),
      })
    )
    .use(swagger())
