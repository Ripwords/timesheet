import { describe, it, expect, beforeAll, afterEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../src/db/schema"
import { generateMonthlySummaries } from "../src/cron/generateMonthlySummaries"

let db: any

beforeAll(() => {
  const sqlite = new Database(":memory:")
  db = drizzle(sqlite, { schema })
  sqlite.exec(
    Object.values(schema)
      .map((t: any) => t.createSQL)
      .filter(Boolean)
      .join(";")
  )
})

afterEach(() => {
  db.delete(schema.timeEntries).run()
  db.delete(schema.monthlyCostSummaries).run()
})

describe("monthly summary edge cases", () => {
  it("is idempotent – running twice does not duplicate rows", async () => {
    // create one historical entry
    const uid = "a1b2c3"
    const pid = "p1"
    const past = new Date()
    past.setMonth(past.getMonth() - 2)

    await db.insert(schema.timeEntries).values({
      id: crypto.randomUUID(),
      userId: uid,
      projectId: pid,
      date: past,
      durationSeconds: 1800,
      hourlyRate: "10.00",
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run()

    await generateMonthlySummaries(db)
    await generateMonthlySummaries(db) // second run

    const rows = await db.select().from(schema.monthlyCostSummaries)
    expect(rows.length).toBe(1)
  })

  it("aggregates multiple users correctly", async () => {
    const pid = "p2"
    const monthStart = new Date()
    monthStart.setMonth(monthStart.getMonth() - 3)

    const users = ["u1", "u2", "u3"]
    for (const u of users) {
      await db.insert(schema.timeEntries).values({
        id: crypto.randomUUID(),
        userId: u,
        projectId: pid,
        date: monthStart,
        durationSeconds: 3600,
        hourlyRate: "30.00",
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).run()
    }

    await generateMonthlySummaries(db)
    const rows = await db.select().from(schema.monthlyCostSummaries)
    expect(rows.length).toBe(users.length)
  })
})