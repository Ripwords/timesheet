// Custom ambient typings for packages that lack their own .d.ts files
// or are not picked up correctly by ts-node/Bun during test runs.

declare module "cli-progress" {
  const x: any
  export = x
}

declare module "drizzle-orm/better-sqlite3" {
  export function drizzle<TSchema = any>(
    db: any,
    config: { schema: TSchema }
  ): any
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

declare module "drizzle-orm/postgres-js" {
  export type PostgresJsDatabase<TSchema = any> = any
}

declare module "vitest/globals" {
  import "vitest"
}