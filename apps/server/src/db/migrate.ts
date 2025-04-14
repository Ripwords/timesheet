import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import * as dotenv from "dotenv"

dotenv.config({ path: "../../../.env" }) // Adjust path relative to this script

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.")
}

const runMigrate = async () => {
  let sql
  try {
    // Use ssl: 'require' only if your database requires SSL
    // const sql = postgres(connectionString, { ssl: 'require', max: 1 });
    sql = postgres(connectionString, { max: 1 })
    const db = drizzle(sql)

    console.log("⏳ Running migrations...")

    const start = Date.now()

    await migrate(db, { migrationsFolder: "./drizzle" }) // Point to your migrations folder

    const end = Date.now()

    console.log(`✅ Migrations completed in ${end - start}ms`)

    process.exit(0) // Exit successfully
  } catch (error) {
    console.error("❌ Migration failed:", error)
    process.exit(1) // Exit with error
  }
}

runMigrate()
