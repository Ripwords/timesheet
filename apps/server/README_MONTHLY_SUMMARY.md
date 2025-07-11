# Monthly Cost Summary Mechanism

This document explains how **historical cost accuracy** is maintained via the `monthly_cost_summaries` table.

## Background

`time_entries` now stores a snapshot of the user’s hourly rate in the new `hourly_rate` column.  For the *current* month dashboards query the live `time_entries` table so that edits instantly reflect.

For **all months that have fully ended** we calculate an immutable summary row and persist it to `monthly_cost_summaries`.  This keeps historical data correct – even if a user’s `ratePerHour` later changes – while massively speeding-up queries.

## Schema Changes

* `time_entries.hourly_rate  numeric(10,2) NOT NULL`
* `monthly_cost_summaries` table – per project/user/month totals

See `drizzle/0005_add_monthly_cost_summary.sql` for full DDL.

## Generation Strategy

1. **Startup Job** – On server boot `generateMonthlySummaries()` is executed once.  It walks all months **strictly before the current month** and inserts any missing summaries.
2. **Daily Scheduler** – A lightweight `setInterval` runs the same function every 24 hours; typically just after midnight UTC so that yesterday is still inside the current month.

The logic is idempotent – duplicate `(projectId,userId,month)` tuples are ignored, so you can safely re-run it anytime (see “Backfill” below).

## Manual Backfill

Run the helper script below whenever you need to rebuild or catch-up historical data:

```bash
nr --workspace=apps/server backfill:monthly
```

(or directly via)

```bash
bun run apps/server/src/scripts/backfillMonthlySummaries.ts
```

The script will recompute summaries for all closed months and insert any that are missing.

## Tests

`tests/monthlySummary.test.ts` contains a smoke-test ensuring the generator executes without throwing.  In future this can be expanded with an in-memory database fixture for full correctness checks.