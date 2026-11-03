import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BusyInterval, EventItem, Preferences } from "../src/types";
import {
  busyIntervals,
  eventFormats,
  eventTopics,
  events,
  migrationSnapshots,
  stars,
  userPreferences,
  users,
} from "./db/schema";
import { getDatabase, type Database } from "./db/client";
import {
  parseLegacyBusyIntervals,
  parseLegacyPreferences,
  parseLegacySavedIds,
} from "./account-validation";

export type LegacyRawValues = {
  preferences: string | null;
  saved: string | null;
  busy: string | null;
};

export type AccountData = {
  preferences: Preferences | null;
  savedEventIds: string[];
  savedEvents: EventItem[];
  busyIntervals: BusyInterval[];
};

export type MigrationResult = {
  savedEvents: number;
  busyIntervals: number;
  preferencesImported: boolean;
  snapshotStored: boolean;
};

export interface AccountStore {
  readAccount(clerkUserId: string): Promise<AccountData>;
  migrateLocalStorage(
    clerkUserId: string,
    rawValues: LegacyRawValues,
    eventSnapshots: EventItem[],
  ): Promise<MigrationResult>;
  setSavedEvent(clerkUserId: string, event: EventItem, saved: boolean): Promise<void>;
  savePreferences(clerkUserId: string, preferences: Preferences): Promise<void>;
  replaceBusyIntervals(clerkUserId: string, intervals: BusyInterval[]): Promise<void>;
  clearBusyIntervals(clerkUserId: string): Promise<void>;
}

async function ensureUser(database: Database, clerkUserId: string): Promise<string> {
  await database.insert(users).values({ clerkUserId }).onConflictDoNothing();
  const [user] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (!user) throw new Error("Authenticated account could not be initialized.");
  return user.id;
}

function busyKey(interval: BusyInterval): string {
  const canonical = JSON.stringify([
    new Date(interval.start).toISOString(),
    new Date(interval.end).toISOString(),
    interval.timeZone ?? "",
    interval.sourceId ?? "",
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

async function insertEvent(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  userId: string,
  event: EventItem,
): Promise<string> {
  const values = {
    userId,
    sourceEventId: event.id,
    legacyEventId: event.id,
    title: event.title,
    description: event.description,
    startsAt: new Date(event.start),
    endsAt: new Date(event.end),
    timeZone: event.timeZone,
    city: event.city,
    venue: event.venue,
    source: event.source,
    lumaUrl: event.lumaUrl,
  };
  const [inserted] = await transaction
    .insert(events)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: events.id });
  const [existing] = inserted
    ? [inserted]
    : await transaction
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.userId, userId), eq(events.legacyEventId, event.id)))
      .limit(1);
  if (!existing) throw new Error("Saved event could not be initialized.");

  if (event.topics.length) {
    await transaction.insert(eventTopics)
      .values(event.topics.map((topic) => ({ eventId: existing.id, topic })))
      .onConflictDoNothing();
  }
  if (event.formats.length) {
    await transaction.insert(eventFormats)
      .values(event.formats.map((format) => ({ eventId: existing.id, format })))
      .onConflictDoNothing();
  }
  return existing.id;
}

async function addStar(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  userId: string,
  eventId: string,
) {
  await transaction.insert(stars).values({ userId, eventId }).onConflictDoNothing();
}

export function createAccountStore(suppliedDatabase?: Database): AccountStore {
  const resolveDatabase = () => suppliedDatabase ?? getDatabase();
  return {
    async readAccount(clerkUserId) {
      const database = resolveDatabase();
      const userId = await ensureUser(database, clerkUserId);
      const [preferenceRow] = await database
        .select({ preferences: userPreferences.preferences })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);
      const savedRows = await database
        .select({
          id: events.id,
          legacyEventId: events.legacyEventId,
          title: events.title,
          description: events.description,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          timeZone: events.timeZone,
          city: events.city,
          venue: events.venue,
          source: events.source,
          lumaUrl: events.lumaUrl,
        })
        .from(stars)
        .innerJoin(events, eq(stars.eventId, events.id))
        .where(eq(stars.userId, userId))
        .orderBy(asc(events.startsAt));
      const ids = savedRows.map((row) => row.id);
      const topicRows = ids.length
        ? await database.select().from(eventTopics).where(inArray(eventTopics.eventId, ids))
        : [];
      const formatRows = ids.length
        ? await database.select().from(eventFormats).where(inArray(eventFormats.eventId, ids))
        : [];
      const topicsByEvent = new Map<string, string[]>();
      topicRows.forEach(({ eventId, topic }) => topicsByEvent.set(eventId, [...(topicsByEvent.get(eventId) ?? []), topic]));
      const formatsByEvent = new Map<string, string[]>();
      formatRows.forEach(({ eventId, format }) => formatsByEvent.set(eventId, [...(formatsByEvent.get(eventId) ?? []), format]));
      const savedEvents: EventItem[] = savedRows.flatMap((row) => row.legacyEventId ? [{
        id: row.legacyEventId,
        title: row.title,
        description: row.description,
        start: row.startsAt.toISOString(),
        end: row.endsAt.toISOString(),
        timeZone: row.timeZone,
        city: row.city,
        venue: row.venue,
        topics: (topicsByEvent.get(row.id) ?? []) as EventItem["topics"],
        formats: (formatsByEvent.get(row.id) ?? []) as EventItem["formats"],
        source: row.source === "Luma" ? "Luma" : "Demo",
        lumaUrl: row.lumaUrl,
      }] : []);
      const intervalRows = await database
        .select({
          start: busyIntervals.startsAt,
          end: busyIntervals.endsAt,
          timeZone: busyIntervals.timeZone,
          sourceId: busyIntervals.sourceId,
        })
        .from(busyIntervals)
        .where(eq(busyIntervals.userId, userId))
        .orderBy(asc(busyIntervals.startsAt));
      const storedIntervals: BusyInterval[] = intervalRows.map((row) => ({
        start: row.start.toISOString(),
        end: row.end.toISOString(),
        ...(row.timeZone ? { timeZone: row.timeZone } : {}),
        ...(row.sourceId ? { sourceId: row.sourceId } : {}),
      }));
      return {
        preferences: preferenceRow?.preferences ?? null,
        savedEventIds: savedEvents.map((event) => event.id),
        savedEvents,
        busyIntervals: storedIntervals,
      };
    },

    async migrateLocalStorage(clerkUserId, rawValues, eventSnapshots) {
      const database = resolveDatabase();
      const userId = await ensureUser(database, clerkUserId);
      const savedIds = new Set(parseLegacySavedIds(rawValues.saved));
      const eventById = new Map(eventSnapshots.map((event) => [event.id, event]));
      const preferences = parseLegacyPreferences(rawValues.preferences);
      const intervals = parseLegacyBusyIntervals(rawValues.busy) ?? [];
      const safeRaw = {
        preferences: rawValues.preferences,
        saved: rawValues.saved,
        busy: rawValues.busy,
      };

      return database.transaction(async (transaction) => {
        const [snapshot] = await transaction
          .insert(migrationSnapshots)
          .values({ userId, rawPayload: safeRaw })
          .onConflictDoNothing()
          .returning({ userId: migrationSnapshots.userId });
        if (preferences) {
          await transaction.insert(userPreferences)
            .values({ userId, preferences })
            .onConflictDoNothing();
        }
        let savedCount = 0;
        for (const id of savedIds) {
          const event = eventById.get(id);
          if (!event) continue;
          const eventId = await insertEvent(transaction, userId, event);
          await addStar(transaction, userId, eventId);
          savedCount += 1;
        }
        const uniqueIntervals = new Map(intervals.map((interval) => [busyKey(interval), interval]));
        for (const [legacyKey, interval] of uniqueIntervals) {
          await transaction.insert(busyIntervals).values({
            userId,
            legacyKey,
            startsAt: new Date(interval.start),
            endsAt: new Date(interval.end),
            timeZone: interval.timeZone ?? null,
            sourceId: interval.sourceId ?? null,
          }).onConflictDoNothing();
        }
        return {
          savedEvents: savedCount,
          busyIntervals: uniqueIntervals.size,
          preferencesImported: Boolean(preferences),
          snapshotStored: Boolean(snapshot),
        };
      });
    },

    async setSavedEvent(clerkUserId, event, saved) {
      const database = resolveDatabase();
      const userId = await ensureUser(database, clerkUserId);
      await database.transaction(async (transaction) => {
        if (saved) {
          const eventId = await insertEvent(transaction, userId, event);
          await addStar(transaction, userId, eventId);
        } else {
          const [existing] = await transaction.select({ id: events.id })
            .from(events)
            .where(and(eq(events.userId, userId), eq(events.legacyEventId, event.id)))
            .limit(1);
          if (existing) {
            await transaction.delete(stars)
              .where(and(eq(stars.userId, userId), eq(stars.eventId, existing.id)));
          }
        }
      });
    },

    async savePreferences(clerkUserId, preferences) {
      const database = resolveDatabase();
      const userId = await ensureUser(database, clerkUserId);
      await database.insert(userPreferences)
        .values({ userId, preferences, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { preferences, updatedAt: new Date() },
        });
    },

    async replaceBusyIntervals(clerkUserId, intervals) {
      const database = resolveDatabase();
      const userId = await ensureUser(database, clerkUserId);
      await database.transaction(async (transaction) => {
        await transaction.delete(busyIntervals).where(eq(busyIntervals.userId, userId));
        const uniqueIntervals = new Map(intervals.map((interval) => [busyKey(interval), interval]));
        for (const [legacyKey, interval] of uniqueIntervals) {
          await transaction.insert(busyIntervals).values({
            userId,
            legacyKey,
            startsAt: new Date(interval.start),
            endsAt: new Date(interval.end),
            timeZone: interval.timeZone ?? null,
            sourceId: interval.sourceId ?? null,
          }).onConflictDoNothing();
        }
      });
    },

    async clearBusyIntervals(clerkUserId) {
      const database = resolveDatabase();
      const userId = await ensureUser(database, clerkUserId);
      await database.delete(busyIntervals).where(eq(busyIntervals.userId, userId));
    },
  };
}
