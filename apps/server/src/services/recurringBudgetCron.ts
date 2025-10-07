// This cron job is used for recurring budgets without end dates.
// Recurring budgets with end dates create all injections upfront.
// Recurring budgets without end dates only create injections up to the current period,
// and this cron job continues creating them as time progresses.

import { cron } from "@elysiajs/cron"
import dayjs from "dayjs"
import { and, eq, gte, lte, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "../db/schema"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const db = drizzle(pool, { schema })

// Define proper types based on schema
type RecurringBudgetInjection = {
  id: string
  projectId: string
  amount: string
  frequency: string
  startDate: string
  endDate: string | null
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export const recurringBudgetCron = cron({
  name: "recurring-budget-processor",
  pattern: "0 0 * * *", // Run daily at midnight
  run: async () => {
    console.log("🔄 Processing recurring budget injections...")

    try {
      // Get all active recurring budget injections that don't have an end date
      const activeRecurringBudgets = await db
        .select({
          id: schema.projectRecurringBudgetInjections.id,
          projectId: schema.projectRecurringBudgetInjections.projectId,
          amount: schema.projectRecurringBudgetInjections.amount,
          frequency: schema.projectRecurringBudgetInjections.frequency,
          startDate: schema.projectRecurringBudgetInjections.startDate,
          endDate: schema.projectRecurringBudgetInjections.endDate,
          description: schema.projectRecurringBudgetInjections.description,
          isActive: schema.projectRecurringBudgetInjections.isActive,
          createdAt: schema.projectRecurringBudgetInjections.createdAt,
          updatedAt: schema.projectRecurringBudgetInjections.updatedAt,
        })
        .from(schema.projectRecurringBudgetInjections)
        .where(
          and(
            eq(schema.projectRecurringBudgetInjections.isActive, true),
            isNull(schema.projectRecurringBudgetInjections.endDate)
          )
        )

      console.log(
        `Found ${activeRecurringBudgets.length} active recurring budget injections without end dates`
      )

      for (const recurringBudget of activeRecurringBudgets) {
        await processRecurringBudget(recurringBudget)
      }

      console.log("✅ Recurring budget processing completed")
    } catch (error) {
      console.error("❌ Error processing recurring budgets:", error)
    }
  },
})

async function processRecurringBudget(
  recurringBudget: RecurringBudgetInjection
) {
  const today = dayjs()
  const startDate = dayjs(recurringBudget.startDate)

  // Check if we're within the valid date range
  if (today.isBefore(startDate)) {
    console.log(
      `Skipping ${recurringBudget.projectId} - start date not reached`
    )
    return
  }

  // No need to check end date since we only process recurring budgets without end dates

  // Calculate the next injection date based on frequency
  const nextInjectionDate = calculateNextInjectionDate(
    startDate,
    recurringBudget.frequency,
    today
  )

  // Check if we need to create an injection for this period
  const shouldCreateInjection = await shouldCreateBudgetInjection(
    recurringBudget.projectId,
    nextInjectionDate,
    recurringBudget.frequency
  )

  if (shouldCreateInjection) {
    await createBudgetInjection(recurringBudget, nextInjectionDate.toDate())
  }
}

function calculateNextInjectionDate(
  startDate: dayjs.Dayjs,
  frequency: string,
  currentDate: dayjs.Dayjs
): dayjs.Dayjs {
  let nextDate = startDate

  // Find the next injection date based on frequency
  while (nextDate.isBefore(currentDate)) {
    switch (frequency) {
      case "monthly":
        nextDate = nextDate.add(1, "month")
        break
      case "quarterly":
        nextDate = nextDate.add(3, "month")
        break
      case "yearly":
        nextDate = nextDate.add(1, "year")
        break
      default:
        throw new Error(`Invalid frequency: ${frequency}`)
    }
  }

  return nextDate
}

async function shouldCreateBudgetInjection(
  projectId: string,
  injectionDate: dayjs.Dayjs,
  frequency: string
): Promise<boolean> {
  // For monthly/quarterly/yearly, we need to check if there's already an injection
  // within a reasonable window around the expected date
  let windowStart: dayjs.Dayjs
  let windowEnd: dayjs.Dayjs

  switch (frequency) {
    case "monthly":
      windowStart = injectionDate.subtract(1, "month")
      windowEnd = injectionDate.add(1, "month")
      break
    case "quarterly":
      windowStart = injectionDate.subtract(3, "month")
      windowEnd = injectionDate.add(3, "month")
      break
    case "yearly":
      windowStart = injectionDate.subtract(1, "year")
      windowEnd = injectionDate.add(1, "year")
      break
    default:
      return false
  }

  const existingInjection = await db.query.projectBudgetInjections.findFirst({
    where: and(
      eq(schema.projectBudgetInjections.projectId, projectId),
      gte(schema.projectBudgetInjections.date, windowStart.toDate()),
      lte(schema.projectBudgetInjections.date, windowEnd.toDate())
    ),
  })

  return !existingInjection
}

async function createBudgetInjection(
  recurringBudget: RecurringBudgetInjection,
  injectionDate: Date
) {
  try {
    const newInjection = await db
      .insert(schema.projectBudgetInjections)
      .values({
        projectId: recurringBudget.projectId,
        date: injectionDate,
        budget: recurringBudget.amount,
        description: `Recurring ${recurringBudget.frequency} injection: ${
          recurringBudget.description || "Auto-generated"
        }`,
      })
      .returning()

    console.log(
      `✅ Created budget injection for ${recurringBudget.projectId}: $${
        recurringBudget.amount
      } on ${dayjs(injectionDate).format("YYYY-MM-DD")}`
    )

    return newInjection[0]
  } catch (error) {
    console.error(
      `❌ Failed to create budget injection for ${recurringBudget.projectId}:`,
      error
    )
    throw error
  }
}
