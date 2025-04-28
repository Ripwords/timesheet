import {
  pgTable,
  serial,
  text,
  timestamp,
  pgEnum,
  integer,
  type AnyPgColumn,
  boolean,
} from "drizzle-orm/pg-core"

export const userRoleEnum = pgEnum("user_role", ["admin", "user"])
export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "inactive",
])

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  maxSessionMinutes: integer("max_session_minutes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
export type Department = typeof departments.$inferSelect

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  accountStatus: accountStatusEnum("account_status")
    .default("active")
    .notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(), // Store hashed passwords, never plain text!
  role: userRoleEnum("role").default("user").notNull(),
  departmentId: integer("department_id")
    .notNull()
    .references((): AnyPgColumn => departments.id, { onDelete: "restrict" }),
  emailVerified: boolean("email_verified").default(false).notNull(),
  verificationToken: text("verification_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})
export type User = typeof users.$inferSelect

export const resetPasswordTokens = pgTable("reset_password_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
export type ResetPasswordToken = typeof resetPasswordTokens.$inferSelect

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})
export type Project = typeof projects.$inferSelect

export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  projectId: integer("project_id")
    .notNull()
    .references((): AnyPgColumn => projects.id, { onDelete: "restrict" }),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  description: text("description"),
  durationSeconds: integer("duration_seconds").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})
export type TimeEntry = typeof timeEntries.$inferSelect

export const departmentDefaultDescription = pgTable(
  "department_default_description",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references((): AnyPgColumn => departments.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
  }
)
export type DepartmentDefaultDescription =
  typeof departmentDefaultDescription.$inferSelect
