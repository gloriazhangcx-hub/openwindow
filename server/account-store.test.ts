import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../src/data/events";
import { calculateMyEventsSummary } from "../src/lib/dashboard";
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
import type { EventItem, ManualEventInput } from "../src/types";

test("PostgreSQL account storage isolates users and local migration is idempotent", {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const [
    { getDatabase, getPool, closeDatabase },
    { createAccountStore },
    { migrateLegacyStars },
    { migrateSavedEventsToStars },
  ] = await Promise.all([
    import("./db/client"),
    import("./account-store"),
    import("./db/legacy-star-migration"),
    import("./db/saved-events-to-stars-migration"),
  ]);
  const db = getDatabase();
  const store = createAccountStore(db);
  const aliceId = `test_${randomUUID()}`;
  const bobId = `test_${randomUUID()}`;
  const migrationId = `test_${randomUUID()}`;
  const savedToStarsMigrationId = `test_${randomUUID()}`;
  const conflictMigrationId = `test_${randomUUID()}`;
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
    assert.deepEqual(alice.starredEvents.map((item) => item.id), [event.id]);
    assert.equal(alice.attendanceByEventId[event.id], "interested");
    assert.deepEqual(alice.preferences?.cities, ["Berkeley"]);
    assert.equal(alice.busyIntervals.length, 1);
    assert.deepEqual(bob.starredEvents, []);
    assert.deepEqual(bob.attendanceByEventId, {});
    assert.equal(bob.preferences, null);
    assert.deepEqual(bob.busyIntervals, []);

    await store.setStarredEvent(bobId, demoEvents[1], true);
    const aliceAfterBobWrite = await store.readAccount(aliceId);
    const bobAfterWrite = await store.readAccount(bobId);
    assert.deepEqual(aliceAfterBobWrite.starredEvents.map((item) => item.id), [event.id]);
    assert.deepEqual(bobAfterWrite.starredEvents.map((item) => item.id), [demoEvents[1].id]);
    assert.equal(bobAfterWrite.attendanceByEventId[demoEvents[1].id], "interested");

    assert.equal(await store.updateAttendanceStatus(aliceId, event.id, "planning_to_attend"), true);
    assert.equal(await store.updateAttendanceStatus(bobId, event.id, "registered"), false);
    const aliceAfterStatus = await store.readAccount(aliceId);
    const bobAfterCrossAccountStatusAttempt = await store.readAccount(bobId);
    assert.equal(aliceAfterStatus.attendanceByEventId[event.id], "planning_to_attend");
    assert.equal(
      (await createAccountStore(db).readAccount(aliceId)).attendanceByEventId[event.id],
      "planning_to_attend",
    );
    assert.equal(bobAfterCrossAccountStatusAttempt.attendanceByEventId[demoEvents[1].id], "interested");

    const independentStarEvent = demoEvents[4];
    await store.setStarredEvent(aliceId, independentStarEvent, true);
    await store.setStarredEvent(aliceId, independentStarEvent, true);
    const reloadedStore = createAccountStore(db);
    const aliceWithStar = await reloadedStore.readAccount(aliceId);
    const bobAfterReload = await reloadedStore.readAccount(bobId);
    assert.deepEqual(aliceWithStar.starredEvents.map((item) => item.id), [event.id, independentStarEvent.id]);
    assert.deepEqual(bobAfterReload.starredEvents.map((item) => item.id), [demoEvents[1].id]);
    assert(!bobAfterReload.starredEvents.some((item) => item.id === event.id));
    await store.setStarredEvent(bobId, independentStarEvent, false);
    assert.deepEqual((await reloadedStore.readAccount(aliceId)).starredEvents.map((item) => item.id), [event.id, independentStarEvent.id]);
    assert.deepEqual((await reloadedStore.readAccount(bobId)).starredEvents.map((item) => item.id), [demoEvents[1].id]);
    await store.setStarredEvent(aliceId, independentStarEvent, false);
    const aliceAfterUnstar = await reloadedStore.readAccount(aliceId);
    assert.deepEqual(aliceAfterUnstar.starredEvents.map((item) => item.id), [event.id]);

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
    assert.equal(aliceWithManualEvent.starredEvents.some((item) => item.id === manualEvent.id), false);
    assert.deepEqual(bobWithoutManualEvent.manualEvents, []);
    assert.equal(await store.updateManualEventAttendance(bobId, manualEvent.id.slice("manual:".length), "registered"), false);
    assert.equal(await store.updateManualEvent(bobId, manualEvent.id.slice("manual:".length), manualInput), null);
    assert.equal(await store.deleteManualEvent(bobId, manualEvent.id.slice("manual:".length)), false);
    assert.equal(await store.updateManualEventAttendance(aliceId, manualEvent.id.slice("manual:".length), "planning_to_attend"), true);
    await store.setStarredEvent(aliceId, manualEvent, false);
    assert.equal((await store.readAccount(aliceId)).manualEvents.length, 1);
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
    assert.equal(bobSavedRowsAfterSave.length, 0);
    assert.equal(bobStarsAfterSave.length, 1);

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
    await db.insert(stars).values({
      userId: bobUser[0].id,
      eventId: legacyEventRow.id,
      attendanceStatus: "registered",
    });

    const client = await getPool().connect();
    let migratedCount = 0;
    try {
      await client.query("BEGIN");
      migratedCount = await migrateLegacyStars(client, migrationId, [aliceUser[0].id, bobUser[0].id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    assert.equal(migratedCount, 3);
    const [legacyStatusAfterReclassification] = await db.select({ attendanceStatus: savedEvents.attendanceStatus })
      .from(savedEvents)
      .where(and(
        eq(savedEvents.userId, bobUser[0].id),
        eq(savedEvents.eventId, legacyEventRow.id),
      ));
    assert.equal(legacyStatusAfterReclassification.attendanceStatus, "registered");

    const promoteClient = await getPool().connect();
    let promotion: Awaited<ReturnType<typeof migrateSavedEventsToStars>>;
    try {
      await promoteClient.query("BEGIN");
      promotion = await migrateSavedEventsToStars(promoteClient, savedToStarsMigrationId, [aliceUser[0].id, bobUser[0].id]);
      await promoteClient.query("COMMIT");
    } catch (error) {
      await promoteClient.query("ROLLBACK");
      throw error;
    } finally {
      promoteClient.release();
    }
    assert.deepEqual(promotion, { alreadyApplied: false, copied: 3 });
    const bobAfterMigration = await store.readAccount(bobId);
    assert.deepEqual(
      bobAfterMigration.starredEvents.map((item) => item.id).sort(),
      [demoEvents[1].id, legacyStarEvent.id].sort(),
    );
    assert.equal(bobAfterMigration.attendanceByEventId[legacyStarEvent.id], "registered");
    assert.equal(bobAfterMigration.attendanceByEventId[demoEvents[1].id], "interested");
    const bobStarsAfterMigration = await db.select({ eventId: stars.eventId })
      .from(stars)
      .where(eq(stars.userId, bobUser[0].id));
    assert.equal(bobStarsAfterMigration.length, 2);

    const rerunClient = await getPool().connect();
    try {
      await rerunClient.query("BEGIN");
      assert.deepEqual(
        await migrateSavedEventsToStars(rerunClient, savedToStarsMigrationId, [aliceUser[0].id, bobUser[0].id]),
        { alreadyApplied: true, copied: 0 },
      );
      assert.equal(await migrateLegacyStars(rerunClient, migrationId, [aliceUser[0].id, bobUser[0].id]), 0);
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

    const conflictEvent = demoEvents[5];
    await store.setStarredEvent(bobId, conflictEvent, true);
    await store.updateAttendanceStatus(bobId, conflictEvent.id, "registered");
    const [conflictEventRow] = await db.select({ id: events.id })
      .from(events)
      .where(and(
        eq(events.userId, bobUser[0].id),
        eq(events.legacyEventId, conflictEvent.id),
      ))
      .limit(1);
    await db.insert(savedEvents).values({
      userId: bobUser[0].id,
      eventId: conflictEventRow.id,
      attendanceStatus: "planning_to_attend",
    }).onConflictDoNothing();

    const conflictClient = await getPool().connect();
    try {
      await conflictClient.query("BEGIN");
      await assert.rejects(
        migrateSavedEventsToStars(conflictClient, conflictMigrationId, [bobUser[0].id]),
        /different attendance status/,
      );
      await conflictClient.query("ROLLBACK");
    } catch (error) {
      await conflictClient.query("ROLLBACK");
      throw error;
    } finally {
      conflictClient.release();
    }
    const [unmodifiedConflictStar] = await db.select({ attendanceStatus: stars.attendanceStatus })
      .from(stars)
      .where(and(eq(stars.userId, bobUser[0].id), eq(stars.eventId, conflictEventRow.id)));
    const [unmodifiedConflictSave] = await db.select({ attendanceStatus: savedEvents.attendanceStatus })
      .from(savedEvents)
      .where(and(eq(savedEvents.userId, bobUser[0].id), eq(savedEvents.eventId, conflictEventRow.id)));
    assert.equal(unmodifiedConflictStar.attendanceStatus, "registered");
    assert.equal(unmodifiedConflictSave.attendanceStatus, "planning_to_attend");

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
    await db.delete(schemaMigrations).where(inArray(schemaMigrations.id, [
      migrationId,
      savedToStarsMigrationId,
      conflictMigrationId,
    ]));
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

test("My Events dashboard count comes from the user's persisted account records", {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const [
    { getDatabase, closeDatabase },
    { createAccountStore },
  ] = await Promise.all([
    import("./db/client"),
    import("./account-store"),
  ]);
  const db = getDatabase();
  const store = createAccountStore(db);
  const clerkUserId = `test_dashboard_${randomUUID()}`;
  const makeCandidate = (title: string): EventItem => ({
    id: `course-test:${randomUUID()}`,
    title,
    description: "Temporary deterministic course acceptance-test data.",
    start: "2030-06-10T18:00:00-07:00",
    end: "2030-06-10T19:00:00-07:00",
    timeZone: "America/Los_Angeles",
    city: "Oakland",
    venue: "Course test venue",
    topics: ["AI & Tech"],
    formats: ["Workshop"],
    source: "Demo",
    lumaUrl: "",
  });
  const firstStar = makeCandidate("Course test starred event one");
  const secondStar = makeCandidate("Course test starred event two");
  const unstarred = makeCandidate("Course test unstarred event");

  const manualInput: ManualEventInput = {
    title: "Course test manual event",
    description: "Created only for the dashboard acceptance test.",
    start: "2030-06-10T18:00:00-07:00",
    end: "2030-06-10T19:00:00-07:00",
    timeZone: "America/Los_Angeles",
    location: "Test location",
    eventUrl: "https://example.com/course-test",
    topics: ["AI & Tech"],
    formats: ["Workshop"],
  };

  try {
    await store.setStarredEvent(clerkUserId, firstStar, true);
    await store.setStarredEvent(clerkUserId, secondStar, true);
    await store.createManualEvent(clerkUserId, manualInput);

    // Read the account back from PostgreSQL; the summary is not built from demo totals.
    const account = await store.readAccount(clerkUserId);
    const summary = calculateMyEventsSummary(
      [...account.starredEvents, unstarred, ...account.manualEvents],
      account.starredEvents.map((event) => event.id),
      account.manualEvents.map((event) => event.id),
      account.attendanceByEventId,
    );

    assert.deepEqual(
      {
        totalEvents: summary.totalEvents,
        fromDiscover: summary.fromDiscover,
        addedByMe: summary.addedByMe,
      },
      { totalEvents: 3, fromDiscover: 2, addedByMe: 1 },
    );
  } finally {
    await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
    await closeDatabase();
  }
});
