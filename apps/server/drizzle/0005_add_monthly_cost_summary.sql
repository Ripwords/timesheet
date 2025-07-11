-- 0005_add_monthly_cost_summary.sql
-- Adds `hourly_rate` column to `time_entries` and creates `monthly_cost_summaries` table.

-- 1. Add hourly_rate column with default 0.00 (will be updated for existing rows via backfill script)
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2) NOT NULL DEFAULT 0.00;

-- 2. Create monthly_cost_summaries table
CREATE TABLE IF NOT EXISTS monthly_cost_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  month date NOT NULL,
  total_duration_seconds integer NOT NULL,
  total_cost numeric(12,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);