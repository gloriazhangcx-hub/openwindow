import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../src/data/events";
import { busyIntervals, migrationSnapshots, users } from "./db/schema";
import type { LegacyRawValues } from "./account-store";

test("PostgreSQL account storage is isolated and local migration is idempotent", {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const [{ getDatabase, closeDatabase }, { createAccountStore }] = await Promise.all([
    import("./db/client"),
    import("./account-store"),
  ]);
  const db = getDatabase();
  const store = createAccountStore(db);
  const aliceId = `test_${randomUUID()}`;
  const bobId = `test_${randomUUID()}`;
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
    assert.deepEqual(alice.preferences?.cities, ["Berkeley"]);
    assert.equal(alice.busyIntervals.length, 1);
    assert.deepEqual(bob.savedEventIds, []);
    assert.equal(bob.preferences, null);
    assert.deepEqual(bob.busyIntervals, []);

    await store.setSavedEvent(bobId, demoEvents[1], true);
    const aliceAfterBobWrite = await store.readAccount(aliceId);
    const bobAfterWrite = await store.readAccount(bobId);
    assert.deepEqual(aliceAfterBobWrite.savedEventIds, [event.id]);
    assert.deepEqual(bobAfterWrite.savedEventIds, [demoEvents[1].id]);

    const aliceUser = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, aliceId)).limit(1);
    const bobUser = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, bobId)).limit(1);
    assert.equal(aliceUser.length, 1);
    assert.equal(bobUser.length, 1);
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
