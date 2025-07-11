import { lt, sql } from "drizzle-orm"
import { Decimal } from "decimal.js"
import dayjs from "dayjs"
import {
  monthlyCostSummaries,
  timeEntries,
} from "../db/schema"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as schema from "../db/schema"

/**
 * Generates cost summaries for **all months strictly before the provided `currentDate` month**.
 * This function is idempotent – if summaries already exist for a (projectId,userId,month)
 * tuple it will skip insertion for that tuple.
 */
export const generateMonthlySummaries = async (
  db: PostgresJsDatabase<typeof schema>,
  currentDate: Date = new Date(),
  onProgress?: (processed: number, total: number) => void
) => {
  // Determine the first day of the current month (exclusive upper bound)
  const currentMonthStartStr = dayjs(currentDate)
    .startOf("month")
    .format("YYYY-MM-DD")

  // Query existing summary months to avoid duplicates
  const existing = await db
    .select({
      projectId: monthlyCostSummaries.projectId,
      userId: monthlyCostSummaries.userId,
      month: monthlyCostSummaries.month,
    })
    .from(monthlyCostSummaries)

  const existingSet = new Set<string>()
  for (const e of existing) {
    existingSet.add(`${e.projectId}:${e.userId}:${dayjs(e.month).format("YYYY-MM")}`)
  }

  // Aggregate time entries for months before current month
  const aggregated = await db
    .select({
      projectId: timeEntries.projectId,
      userId: timeEntries.userId,
      month: sql<string>`date_trunc('month', ${timeEntries.date})`,
      totalDurationSeconds: sql<number>`sum(${timeEntries.durationSeconds})`.mapWith(
        Number
      ),
      totalCost: sql<string>`sum((${timeEntries.durationSeconds} / 3600.0) * ${timeEntries.hourlyRate})`,
    })
    .from(timeEntries)
    .where(lt(timeEntries.date, currentMonthStartStr))
    .groupBy(timeEntries.projectId, timeEntries.userId, sql`date_trunc('month', ${timeEntries.date})`)

  if (aggregated.length === 0) return

  const valuesToInsert = aggregated.filter((row: any, idx: number) => {
    const key = `${row.projectId}:${row.userId}:${dayjs(row.month).format("YYYY-MM")}`
    onProgress?.(idx + 1, aggregated.length)
    return !existingSet.has(key)
  })

  if (valuesToInsert.length === 0) return

  // Perform batch insert
  await db.insert(monthlyCostSummaries).values(
    valuesToInsert.map((r) => ({
      projectId: r.projectId,
      userId: r.userId,
      month: dayjs(r.month).format("YYYY-MM-DD"),
      totalDurationSeconds: r.totalDurationSeconds,
      totalCost: new Decimal(r.totalCost).toFixed(2),
    }))
  )
}