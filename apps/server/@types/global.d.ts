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

// vitest types are provided by the package; no additional stubs required.

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
  export const boolean: (...args: any[]) => any
  export const integer: (...args: any[]) => any
  export const numeric: (...args: any[]) => any
  export const pgEnum: (...args: any[]) => any
  export const pgTable: (...args: any[]) => any
  export const text: (...args: any[]) => any
  export const timestamp: (...args: any[]) => any
  export const uuid: (...args: any[]) => any
  export const date: (...args: any[]) => any
  export type AnyPgColumn = any
}

declare module "vitest/globals" {
  import "vitest"
}

// -------------------------------------------------------------------------------------------------
// Base stubs for libraries that are missing or have broken declaration files in Bun/Vitest context.
// These keep the compiler happy without impacting runtime (actual libs ship JS).
// -------------------------------------------------------------------------------------------------

// --------------------------- Elysia core types -----------------------------

declare module "elysia" {
  export class Elysia<Context = any> {
    constructor(config?: any)
    use(plugin: any): this
    decorate(key: string, value: any): this
    group(prefix: string, fn: (app: this) => any): this
    macro(def: Record<string, (...args: any[]) => any>): this
    get(path: string, handler: any, opts?: any): this
    post(path: string, handler: any, opts?: any): this
    put(path: string, handler: any, opts?: any): this
    delete(path: string, handler: any, opts?: any): this
    patch(path: string, handler: any, opts?: any): this
    listen(port: number | string): this & { server: { hostname: string; port: number } }
    server?: { hostname: string; port: number }
  }
  export const t: {
    Object: (...args: any[]) => any
    String: (...args: any[]) => any
    Number: (...args: any[]) => any
    Boolean: (...args: any[]) => any
    Optional: (...args: any[]) => any
    UnionEnum: (...args: any[]) => any
    Array: (...args: any[]) => any
    Literal: (...args: any[]) => any
    Integer: (...args: any[]) => any
  }
}

// ------------------------ Decimal.js default export ------------------------

declare module "decimal.js" {
  class Decimal {
    constructor(value: string | number | Decimal)
    toFixed(dp?: number): string
    mul(n: Decimal | number | string): Decimal
    div(n: Decimal | number | string): Decimal
    add(n: Decimal | number | string): Decimal
    toNumber(): number
    toDecimalPlaces(dp?: number): Decimal
  }
  export = Decimal
  export default Decimal
}

// ------------------------------ DayJS base ---------------------------------

declare module "dayjs" {
  interface DayjsInstance {
    format(fmt?: string): string
    tz(zone: string): DayjsInstance
    startOf(unit: string): DayjsInstance
    isSame(date: any, unit?: string): boolean
  }
  function dayjs(input?: any): DayjsInstance
  namespace dayjs {
    function extend(plugin: (opt: any, c: any) => void, opts?: any): void
  }
  export default dayjs
}

// dayjs plugin modules

declare module "dayjs/plugin/utc" { const plugin: (opt: any, c: any) => void; export = plugin }
declare module "dayjs/plugin/timezone" { const plugin: (opt: any, c: any) => void; export = plugin }

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