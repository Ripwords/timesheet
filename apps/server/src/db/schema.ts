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
export const departmentEnum = pgEnum("department", [
  "frontend_design",
  "frontend_js",
  "backend",
  "uiux",
  "digital_marketing",
])

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(), // Store hashed passwords, never plain text!
  role: userRoleEnum("role").default("user").notNull(),
  department: departmentEnum("department").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  verificationToken: text("verification_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const resetPasswordTokens = pgTable("reset_password_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

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
  durationSeconds: integer("duration_seconds").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
