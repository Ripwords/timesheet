import { expect, test, describe, vi, beforeEach } from "vitest"

// TODO: Use an in-memory database or mock to fully test generateMonthlySummaries.
// For now we provide a simple smoke-test that the function executes without throwing
// when provided a minimal mocked Drizzle adapter.

import { generateMonthlySummaries } from "../src/cron/generateMonthlySummaries"

// Very naive mock – replace with real in-memory DB in future iterations.
const createMockDb = () => {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    mapWith: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    // For chaining .select(...).from(...)
    execute: vi.fn().mockResolvedValue([]),
  }
}

describe("generateMonthlySummaries", () => {
  test("should run without throwing", async () => {
    const mockDb: any = createMockDb()
    await expect(generateMonthlySummaries(mockDb, new Date())).resolves.not.toThrow()
  })
})