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
  export function drizzle<TSchema = any>(client: any, config: { schema: TSchema }): any
  export type PostgresJsDatabase<TSchema = any> = any
}

declare module "drizzle-orm/pg-core" {
  export * from "drizzle-orm"
}

declare module "vitest/globals" {
  import "vitest"
}

// -------------------------------------------------------------------------------------------------
// Base stubs for libraries that are missing or have broken declaration files in Bun/Vitest context.
// These keep the compiler happy without impacting runtime (actual libs ship JS).
// -------------------------------------------------------------------------------------------------

declare module "decimal.js" {
  class Decimal {
    constructor(value: string | number | Decimal)
    toFixed(dp?: number): string
    mul(n: Decimal | number | string): Decimal
    div(n: Decimal | number | string): Decimal
    add(n: Decimal | number | string): Decimal
    toNumber(): number
  }
  export = Decimal
}

declare module "dayjs" {
  function dayjs(input?: any): any
  export default dayjs
}

declare module "elysia" {
  export class Elysia {
    [key: string]: any
  }
}

// Drizzle ORM helpers – simplified but typed enough for app usage
// We expose the most common DSL helpers as `any` functions and types.

declare module "drizzle-orm" {
  export type SQL<T = any> = any
  export const asc: (...args: any[]) => any
  export const desc: (...args: any[]) => any
  export const eq: (...args: any[]) => any
  export const lt: (...args: any[]) => any
  export const lte: (...args: any[]) => any
  export const gte: (...args: any[]) => any
  export const inArray: (...args: any[]) => any
  export const and: (...args: any[]) => any
  export const or: (...args: any[]) => any
  export const sql: SQL

  export type InferModel<T> = any
}

// Generic catch-all for Elysia plugins (swagger, cors, jwt, etc.)
declare module "@elysiajs/*" {
  const plugin: any
  export = plugin
}

// Postgres-js driver minimal type
declare module "postgres" {
  const postgres: (...args: any[]) => any
  export = postgres
}

// Additional dayjs plugins stubs
declare module "dayjs/plugin/relativeTime" { const fn: any; export = fn }
declare module "dayjs/plugin/duration" { const fn: any; export = fn }
declare module "dayjs/plugin/localizedFormat" { const fn: any; export = fn }

// -------------------------------------------------------------------------------------------------
// Additional explicit module stubs to silence TS for external deps that lack types
// -------------------------------------------------------------------------------------------------

declare module "@elysiajs/swagger" { const swagger: any; export = swagger }
declare module "@elysiajs/cors" { const cors: any; export = cors }
declare module "@elysiajs/jwt" { const jwt: any; export = jwt }
declare module "@elysiajs/server-timing" { const plugin: any; export = plugin }
declare module "@elysiajs/cookie" { const plugin: any; export = plugin }

declare module "logixlysia" {
  const plugin: any
  export = plugin
}

declare module "dotenv" {
  export function config(options?: any): { parsed?: Record<string,string> }
}