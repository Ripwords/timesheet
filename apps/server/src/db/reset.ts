import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema"
import { config } from "dotenv"
import { reset } from "drizzle-seed"

// Load environment variables
config({ path: process.cwd() + "/../../.env" })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.")
}

const client = postgres(connectionString)

async function main() {
  console.log("🌱 Resetting database...")
  const db = drizzle(client, { schema })
  await reset(db, schema)
  console.log("🌱 Database reset complete.")
  return db.$client.end()
}
main()
