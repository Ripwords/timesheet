// Custom ambient typings for packages that lack their own .d.ts files
// or are not picked up correctly by ts-node/Bun during test runs.

declare module "cli-progress" {
  const x: any
  export = x
}

declare module "drizzle-orm/better-sqlite3" {
  import type { BetterSQLite3Database } from "drizzle-orm"
  // Simplified type signature – returns generic BetterSQLite3Database
  export function drizzle<TSchema = any>(
    db: any,
    config: { schema: TSchema }
  ): BetterSQLite3Database<TSchema>
}

declare module "better-sqlite3" {
  const y: any
  export = y
}

declare module "vitest" {
  export * from "vitest"
}

// Ensure base drizzle import type is available in case of path resolution issues
declare module "drizzle-orm" {
  const whatever: any
  export = whatever
}