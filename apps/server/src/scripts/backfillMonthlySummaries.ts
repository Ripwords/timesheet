#!/usr/bin/env bun

import { generateMonthlySummaries } from "../cron/generateMonthlySummaries"
import { db } from "../../utils/baseApp"

console.log("▶ Running historical monthly cost summary backfill …")

await generateMonthlySummaries(db, new Date())

console.log("✅ Backfill complete!")