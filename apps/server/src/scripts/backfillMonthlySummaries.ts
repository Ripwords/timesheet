#!/usr/bin/env bun

import { generateMonthlySummaries } from "../cron/generateMonthlySummaries"
import { db } from "../../utils/baseApp"
import cliProgress from "cli-progress"

console.log("▶ Running historical monthly cost summary backfill …")

const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

let total = 0
bar.start(1, 0)

await generateMonthlySummaries(db, new Date(), (processed, t) => {
  if (t !== total) {
    total = t
    bar.setTotal(t)
  }
  bar.update(processed)
})

bar.stop()

console.log("✅ Backfill complete!")