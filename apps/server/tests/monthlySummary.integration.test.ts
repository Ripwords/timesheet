/// <reference types="vitest" />
import "vitest/globals"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../src/db/schema"
import { generateMonthlySummaries } from "../src/cron/generateMonthlySummaries"

let db: ReturnType<typeof drizzle>

beforeAll(() => {
  const sqlite = new Database(":memory:")
  db = drizzle(sqlite, { schema })

  // Create tables
  sqlite.exec(
    Object.values(schema)
      .map((t: any) => t.createSQL) // drizzle table objects expose createSQL in migration mode
      .filter(Boolean)
      .join(";")
  )
})

afterEach(() => {
  // wipe tables
  db.delete(schema.timeEntries).run()
  db.delete(schema.monthlyCostSummaries).run()
})

describe("generateMonthlySummaries", () => {
  it("aggregates previous month only", async () => {
    const uid = "00000000-0000-0000-0000-000000000001"
    const pid = "00000000-0000-0000-0000-000000000002"

    const lastMonth = new Date()
    lastMonth.setDate(1)
    lastMonth.setMonth(lastMonth.getMonth() - 1)

    await db
      .insert(schema.timeEntries)
      .values({
        id: crypto.randomUUID(),
        userId: uid,
        projectId: pid,
        date: lastMonth,
        durationSeconds: 3600,
        hourlyRate: "50.00",
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()

    await generateMonthlySummaries(db)

    const summaries = await db.select().from(schema.monthlyCostSummaries)
    expect(summaries.length).toBe(1)
    expect(summaries[0].totalCost).toBe("50.00")
  })
})