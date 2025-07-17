import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { timeEntries, users } from "./schema"
import { eq } from "drizzle-orm"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const db = drizzle(pool)

async function backfillTimeEntryRates() {
  console.log(
    "Starting time entry rate backfill for entries with 0.00 rates..."
  )

  try {
    // Get all time entries that have 0.00 rate_per_hour
    const entriesWithZeroRates = await db
      .select({
        id: timeEntries.id,
        userId: timeEntries.userId,
      })
      .from(timeEntries)
      .where(eq(timeEntries.ratePerHour, "0"))

    console.log(
      `Found ${entriesWithZeroRates.length} time entries with 0.00 rates`
    )

    if (entriesWithZeroRates.length === 0) {
      console.log("No entries need backfilling")
      return
    }

    // Get all users with their rates
    const allUsers = await db
      .select({
        id: users.id,
        ratePerHour: users.ratePerHour,
      })
      .from(users)

    const userRates = new Map(allUsers.map((u) => [u.id, u.ratePerHour]))

    // Update each time entry with the user's current rate
    let updatedCount = 0
    for (const entry of entriesWithZeroRates) {
      const userRate = userRates.get(entry.userId)
      if (userRate && userRate !== "0.00") {
        await db
          .update(timeEntries)
          .set({ ratePerHour: userRate })
          .where(eq(timeEntries.id, entry.id))
        updatedCount++
      } else {
        console.warn(
          `No valid rate found for user ${entry.userId} (rate: ${userRate})`
        )
      }
    }

    console.log(
      `Successfully updated ${updatedCount} time entries with user rates`
    )
  } catch (error) {
    console.error("Error during rate backfill:", error)
    throw error
  } finally {
    await pool.end()
  }
}

// Run the backfill if this script is executed directly
if (require.main === module) {
  backfillTimeEntryRates()
    .then(() => {
      console.log("Rate backfill completed successfully")
      process.exit(0)
    })
    .catch((error) => {
      console.error("Rate backfill failed:", error)
      process.exit(1)
    })
}

export { backfillTimeEntryRates }
