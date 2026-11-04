import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../src/data/events";
import {
  busyIntervals,
  events,
  manualEvents,
  migrationSnapshots,
  savedEvents,
  schemaMigrations,
  stars,
  users,
} from "./db/schema";
import type { LegacyRawValues } from "./account-store";
import type { ManualEventInput } from "../src/types";

test("PostgreSQL account storage is isolated and local migration is idempotent", {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const [{ getDatabase, getPool, closeDatabase }, { createAccountStore }, { migrateLegacyStars }] = await Promise.all([
    import("./db/client"),
    import("./account-store"),
    import("./db/legacy-star-migration"),
  ]);
  const db = getDatabase();
  const store = createAccountStore(db);
  const aliceId = `test_${randomUUID()}`;
  const bobId = `test_${randomUUID()}`;
  const migrationId = `test_${randomUUID()}`;
  const event = demoEvents[0];
  const start = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const interval = {
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: "America/Los_Angeles",
    sourceId: "test-calendar",
  };
  const aliceRaw: LegacyRawValues = {
    preferences: JSON.stringify({ ...DEFAULT_PREFERENCES, cities: ["Berkeley"] }),
    saved: JSON.stringify([event.id]),
    busy: JSON.stringify({ busy: [interval] }),
  };
  const corruptRaw: LegacyRawValues = {
    preferences: "{bad-json",
    saved: "[not-json",
    busy: "{malformed",
  };

  try {
    await store.migrateLocalStorage(aliceId, aliceRaw, [event]);
    await store.migrateLocalStorage(aliceId, aliceRaw, [event]);
    await store.migrateLocalStorage(bobId, corruptRaw, []);

    const alice = await store.readAccount(aliceId);
    const bob = await store.readAccount(bobId);
    assert.deepEqual(alice.savedEventIds, [event.id]);
    assert.equal(alice.attendanceByEventId[event.id], "interested");
    assert.deepEqual(alice.preferences?.cities, ["Berkeley"]);
    assert.equal(alice.busyIntervals.length, 1);
    assert.deepEqual(bob.savedEventIds, []);
    assert.deepEqual(bob.attendanceByEventId, {});
    assert.equal(bob.preferences, null);
    assert.deepEqual(bob.busyIntervals, []);

    await store.setSavedEvent(bobId, demoEvents[1], true);
    const aliceAfterBobWrite = await store.readAccount(aliceId);
    const bobAfterWrite = await store.readAccount(bobId);
    assert.deepEqual(aliceAfterBobWrite.savedEventIds, [event.id]);
    assert.deepEqual(bobAfterWrite.savedEventIds, [demoEvents[1].id]);
    assert.equal(bobAfterWrite.attendanceByEventId[demoEvents[1].id], "interested");

    assert.equal(await store.updateAttendanceStatus(aliceId, event.id, "planning_to_attend"), true);
    assert.equal(await store.updateAttendanceStatus(bobId, event.id, "registered"), false);
    const aliceAfterStatus = await store.readAccount(aliceId);
    const bobAfterCrossAccountStatusAttempt = await store.readAccount(bobId);
    assert.equal(aliceAfterStatus.attendanceByEventId[event.id], "planning_to_attend");
    assert.equal(bobAfterCrossAccountStatusAttempt.attendanceByEventId[demoEvents[1].id], "interested");

    const independentStarEvent = demoEvents[4];
    await store.setStarredEvent(aliceId, independentStarEvent, true);
    const reloadedStore = createAccountStore(db);
    const aliceStarOnly = await reloadedStore.readAccount(aliceId);
    assert.equal(aliceStarOnly.savedEventIds.includes(independentStarEvent.id), false);
    assert.deepEqual(aliceStarOnly.starredEvents.map((item) => item.id), [independentStarEvent.id]);

    await store.setSavedEvent(aliceId, independentStarEvent, true);
    const aliceWithStar = await reloadedStore.readAccount(aliceId);
    const bobWithoutStar = await reloadedStore.readAccount(bobId);
    assert.ok(aliceWithStar.savedEventIds.includes(independentStarEvent.id));
    assert.deepEqual(aliceWithStar.starredEvents.map((item) => item.id), [independentStarEvent.id]);
    assert.deepEqual(bobWithoutStar.starredEvents, []);

    await store.setSavedEvent(aliceId, independentStarEvent, false);
    const aliceAfterUnbookmark = await reloadedStore.readAccount(aliceId);
    assert.equal(aliceAfterUnbookmark.savedEventIds.includes(independentStarEvent.id), false);
    assert.deepEqual(aliceAfterUnbookmark.starredEvents.map((item) => item.id), [independentStarEvent.id]);
    await store.setStarredEvent(bobId, independentStarEvent, false);
    assert.deepEqual((await reloadedStore.readAccount(aliceId)).starredEvents.map((item) => item.id), [independentStarEvent.id]);
    assert.deepEqual((await reloadedStore.readAccount(bobId)).starredEvents, []);
    await store.setStarredEvent(aliceId, independentStarEvent, false);
    const aliceAfterUnstar = await reloadedStore.readAccount(aliceId);
    assert.equal(aliceAfterUnstar.savedEventIds.includes(independentStarEvent.id), false);
    assert.deepEqual(aliceAfterUnstar.starredEvents, []);

    const manualInput: ManualEventInput = {
      title: "Personal Community Meetup",
      description: "An event added by the account owner.",
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: "America/Los_Angeles",
      location: "Oakland",
      eventUrl: "https://example.com/meetup",
      topics: ["Social Impact"],
      formats: ["Networking"],
    };
    const manualEvent = await store.createManualEvent(aliceId, manualInput);
    assert.equal(manualEvent.source, "Manual");
    assert.match(manualEvent.id, /^manual:[0-9a-f-]{36}$/i);
    assert.equal(manualEvent.location, "Oakland");
    const aliceWithManualEvent = await store.readAccount(aliceId);
    const bobWithoutManualEvent = await store.readAccount(bobId);
    assert.equal(aliceWithManualEvent.manualEvents.length, 1);
    assert.equal(aliceWithManualEvent.attendanceByEventId[manualEvent.id], "interested");
    assert.equal(aliceWithManualEvent.savedEventIds.includes(manualEvent.id), false);
    assert.deepEqual(bobWithoutManualEvent.manualEvents, []);
    assert.equal(await store.updateManualEventAttendance(bobId, manualEvent.id.slice("manual:".length), "registered"), false);
    assert.equal(await store.updateManualEvent(bobId, manualEvent.id.slice("manual:".length), manualInput), null);
    assert.equal(await store.deleteManualEvent(bobId, manualEvent.id.slice("manual:".length)), false);
    assert.equal(await store.updateManualEventAttendance(aliceId, manualEvent.id.slice("manual:".length), "planning_to_attend"), true);
    const editedManualEvent = await store.updateManualEvent(aliceId, manualEvent.id.slice("manual:".length), {
      ...manualInput,
      title: "Updated Community Meetup",
    });
    assert.equal(editedManualEvent?.title, "Updated Community Meetup");
    const aliceUser = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, aliceId)).limit(1);
    const bobUser = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, bobId)).limit(1);
    const manualRows = await db.select({ id: manualEvents.id, title: manualEvents.title })
      .from(manualEvents)
      .where(eq(manualEvents.userId, aliceUser[0].id));
    assert.equal(aliceUser.length, 1);
    assert.equal(bobUser.length, 1);
    assert.equal(manualRows.length, 1);
    assert.equal(manualRows[0].title, "Updated Community Meetup");
    assert.equal(await store.deleteManualEvent(aliceId, manualEvent.id.slice("manual:".length)), true);
    const aliceAfterManualDelete = await store.readAccount(aliceId);
    assert.deepEqual(aliceAfterManualDelete.manualEvents, []);
    assert.equal(Object.hasOwn(aliceAfterManualDelete.attendanceByEventId, manualEvent.id), false);
    const bobSavedRowsAfterSave = await db.select({ eventId: savedEvents.eventId })
      .from(savedEvents)
      .where(eq(savedEvents.userId, bobUser[0].id));
    const bobStarsAfterSave = await db.select({ eventId: stars.eventId })
      .from(stars)
      .where(eq(stars.userId, bobUser[0].id));
    assert.equal(bobSavedRowsAfterSave.length, 1);
    assert.deepEqual(bobStarsAfterSave, []);

    const legacyStarEvent = demoEvents[2];
    const [legacyEventRow] = await db.insert(events).values({
      userId: bobUser[0].id,
      sourceEventId: legacyStarEvent.id,
      legacyEventId: legacyStarEvent.id,
      title: legacyStarEvent.title,
      description: legacyStarEvent.description,
      startsAt: new Date(legacyStarEvent.start),
      endsAt: new Date(legacyStarEvent.end),
      timeZone: legacyStarEvent.timeZone,
      city: legacyStarEvent.city,
      venue: legacyStarEvent.venue,
      source: legacyStarEvent.source,
      lumaUrl: legacyStarEvent.lumaUrl,
    }).returning({ id: events.id });
    await db.insert(stars).values({ userId: bobUser[0].id, eventId: legacyEventRow.id });

    const client = await getPool().connect();
    let migratedCount = 0;
    try {
      await client.query("BEGIN");
      migratedCount = await migrateLegacyStars(client, migrationId);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    assert.equal(migratedCount, 1);
    const bobAfterMigration = await store.readAccount(bobId);
    assert.deepEqual(
      [...bobAfterMigration.savedEventIds].sort(),
      [demoEvents[1].id, legacyStarEvent.id].sort(),
    );
    const bobStarsAfterMigration = await db.select({ eventId: stars.eventId })
      .from(stars)
      .where(eq(stars.userId, bobUser[0].id));
    assert.deepEqual(bobStarsAfterMigration, []);

    const starOnlyEvent = demoEvents[3];
    const [starOnlyRow] = await db.insert(events).values({
      userId: aliceUser[0].id,
      sourceEventId: starOnlyEvent.id,
      legacyEventId: `star-only-${starOnlyEvent.id}`,
      title: starOnlyEvent.title,
      description: starOnlyEvent.description,
      startsAt: new Date(starOnlyEvent.start),
      endsAt: new Date(starOnlyEvent.end),
      timeZone: starOnlyEvent.timeZone,
      city: starOnlyEvent.city,
      venue: starOnlyEvent.venue,
      source: starOnlyEvent.source,
      lumaUrl: starOnlyEvent.lumaUrl,
    }).returning({ id: events.id });
    await db.insert(stars).values({ userId: aliceUser[0].id, eventId: starOnlyRow.id });
    const aliceAfterStar = await store.readAccount(aliceId);
    assert.deepEqual(aliceAfterStar.savedEventIds, [event.id]);
    assert.ok(aliceAfterStar.starredEvents.some((item) => item.id === `star-only-${starOnlyEvent.id}`));

    const rerunClient = await getPool().connect();
    try {
      await rerunClient.query("BEGIN");
      assert.equal(await migrateLegacyStars(rerunClient, migrationId), 0);
      await rerunClient.query("COMMIT");
    } catch (error) {
      await rerunClient.query("ROLLBACK");
      throw error;
    } finally {
      rerunClient.release();
    }
    const aliceSavedRows = await db.select({ eventId: savedEvents.eventId })
      .from(savedEvents)
      .where(eq(savedEvents.userId, aliceUser[0].id));
    const aliceStarRows = await db.select({ eventId: stars.eventId })
      .from(stars)
      .where(eq(stars.userId, aliceUser[0].id));
    assert.equal(aliceSavedRows.length, 1);
    assert.equal(aliceStarRows.length, 1);

    const rawSnapshot = await db.select({ payload: migrationSnapshots.rawPayload })
      .from(migrationSnapshots)
      .where(eq(migrationSnapshots.userId, bobUser[0].id))
      .limit(1);
    assert.deepEqual(rawSnapshot[0].payload, corruptRaw);
    const aliceIntervals = await db.select({ id: busyIntervals.id })
      .from(busyIntervals)
      .where(and(eq(busyIntervals.userId, aliceUser[0].id)));
    assert.equal(aliceIntervals.length, 1);
  } finally {
    await db.delete(schemaMigrations).where(eq(schemaMigrations.id, migrationId));
    await db.delete(users).where(eq(users.clerkUserId, aliceId));
    await db.delete(users).where(eq(users.clerkUserId, bobId));
    await closeDatabase();
  }
});

test("public demo mode can start without private database configuration", async () => {
  const configuredDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const { createAccountStore } = await import("./account-store");
    const store = createAccountStore();
    assert.equal(typeof store.readAccount, "function");
    await assert.rejects(store.readAccount("unconfigured-user"), /DATABASE_URL is required/);
  } finally {
    if (configuredDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = configuredDatabaseUrl;
  }
});
