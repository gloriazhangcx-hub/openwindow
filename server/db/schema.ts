import type { Preferences, Topic, Format } from "../../src/types";
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: varchar("clerk_user_id", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 320 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceEventId: varchar("source_event_id", { length: 180 }),
    legacyEventId: varchar("legacy_event_id", { length: 180 }),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timeZone: varchar("time_zone", { length: 100 }).notNull(),
    city: varchar("city", { length: 120 }).notNull(),
    venue: varchar("venue", { length: 240 }).notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    lumaUrl: text("luma_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("events_user_legacy_id_unique").on(table.userId, table.legacyEventId),
    index("events_user_id_idx").on(table.userId),
  ],
);

export const eventTopics = pgTable(
  "event_topics",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    topic: varchar("topic", { length: 80 }).$type<Topic>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.topic] })],
);

export const eventFormats = pgTable(
  "event_formats",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    format: varchar("format", { length: 80 }).$type<Format>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.format] })],
);

export const stars = pgTable(
  "stars",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.eventId] }),
    index("stars_user_id_idx").on(table.userId),
  ],
);

export const savedEvents = pgTable(
  "saved_events",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.eventId] }),
    index("saved_events_user_id_idx").on(table.userId),
  ],
);

export const busyIntervals = pgTable(
  "busy_intervals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    legacyKey: varchar("legacy_key", { length: 64 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timeZone: varchar("time_zone", { length: 100 }),
    sourceId: varchar("source_id", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("busy_intervals_user_legacy_key_unique").on(table.userId, table.legacyKey),
    index("busy_intervals_user_id_idx").on(table.userId),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  preferences: jsonb("preferences").$type<Preferences>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const migrationSnapshots = pgTable("migration_snapshots", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  rawPayload: jsonb("raw_payload").$type<Record<string, string | null>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const schemaMigrations = pgTable("openwindow_schema_migrations", {
  id: varchar("id", { length: 120 }).primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
});
