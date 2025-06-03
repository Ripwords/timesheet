import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
  date,
} from "drizzle-orm/pg-core"

export const userRoleEnum = pgEnum("user_role", ["admin", "user"])
export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "inactive",
])

export const departmentColorEnum = pgEnum("department_color", [
  "info",
  "error",
  "primary",
  "secondary",
  "success",
  "warning",
  "neutral",
])

export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  color: departmentColorEnum("color").default("info").notNull(),
  maxSessionMinutes: integer("max_session_minutes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountStatus: accountStatusEnum("account_status")
    .default("active")
    .notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").default("user").notNull(),
  departmentId: uuid("department_id")
    .notNull()
    .references((): AnyPgColumn => departments.id, { onDelete: "restrict" }),
  ratePerHour: numeric("rate_per_hour", { precision: 10, scale: 2 })
    .default("0.00")
    .notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  verificationToken: text("verification_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const resetPasswordTokens = pgTable("reset_password_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references((): AnyPgColumn => projects.id, { onDelete: "restrict" }),
  date: date("date").notNull(),
  description: text("description"),
  durationSeconds: integer("duration_seconds").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const departmentDefaultDescription = pgTable(
  "department_default_description",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    departmentId: uuid("department_id")
      .notNull()
      .references((): AnyPgColumn => departments.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
  }
)

export const projectBudgetInjections = pgTable("project_budget_injections", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references((): AnyPgColumn => projects.id, { onDelete: "restrict" }),
  date: timestamp("date", { withTimezone: true }).notNull(),
  budget: numeric("budget").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const timerStatusEnum = pgEnum("timer_status", ["running", "paused"])

export const activeTimerSessions = pgTable("active_timer_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  status: timerStatusEnum("status").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  totalAccumulatedDuration: integer("total_accumulated_duration")
    .default(0)
    .notNull(),
  lastIntervalStartTime: timestamp("last_interval_start_time", {
    withTimezone: true,
  }), // null when paused, set when running
  description: text("description"), // can be updated during session
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})
