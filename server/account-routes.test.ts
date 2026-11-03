import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import { test } from "node:test";
import { DEFAULT_PREFERENCES } from "../src/data/events";
import type { BusyInterval, EventItem, Preferences } from "../src/types";
import type { AccountData, AccountStore, LegacyRawValues, MigrationResult } from "./account-store";
import { createAccountRouter } from "./account-routes";

class MemoryStore implements AccountStore {
  private readonly rows = new Map<string, AccountData>();

  private row(userId: string): AccountData {
    const existing = this.rows.get(userId);
    if (existing) return existing;
    const created: AccountData = { preferences: null, savedEventIds: [], savedEvents: [], busyIntervals: [] };
    this.rows.set(userId, created);
    return created;
  }

  async readAccount(userId: string) {
    return structuredClone(this.row(userId));
  }

  async migrateLocalStorage(
    userId: string,
    _rawValues: LegacyRawValues,
    eventSnapshots: EventItem[],
  ): Promise<MigrationResult> {
    const row = this.row(userId);
    for (const event of eventSnapshots) {
      if (!row.savedEventIds.includes(event.id)) {
        row.savedEventIds.push(event.id);
        row.savedEvents.push(event);
      }
    }
    return { savedEvents: row.savedEvents.length, busyIntervals: 0, preferencesImported: false, snapshotStored: true };
  }

  async setSavedEvent(userId: string, event: EventItem, saved: boolean) {
    const row = this.row(userId);
    if (saved && !row.savedEventIds.includes(event.id)) {
      row.savedEventIds.push(event.id);
      row.savedEvents.push(event);
    }
    if (!saved) {
      row.savedEventIds = row.savedEventIds.filter((id) => id !== event.id);
      row.savedEvents = row.savedEvents.filter((item) => item.id !== event.id);
    }
  }

  async savePreferences(userId: string, preferences: Preferences) {
    this.row(userId).preferences = preferences;
  }

  async replaceBusyIntervals(userId: string, intervals: BusyInterval[]) {
    this.row(userId).busyIntervals = intervals;
  }

  async clearBusyIntervals(userId: string) {
    this.row(userId).busyIntervals = [];
  }
}

test("private account routes require a verified session identity", async () => {
  const store = new MemoryStore();
  const app = express();
  app.use("/api/account", createAccountRouter(
    store,
    (request) => request.header("x-test-session") ?? null,
  ));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/account`;

  try {
    const response = await fetch(`${base}/data`);
    assert.equal(response.status, 401);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("request-supplied user IDs cannot redirect private writes to another account", async () => {
  const store = new MemoryStore();
  const app = express();
  app.use("/api/account", createAccountRouter(
    store,
    (request) => request.header("x-test-session") ?? null,
  ));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/account`;
  const bobPreferences = { ...DEFAULT_PREFERENCES, cities: ["Oakland"], userId: "alice" };

  try {
    const write = await fetch(`${base}/preferences`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-test-session": "bob" },
      body: JSON.stringify(bobPreferences),
    });
    assert.equal(write.status, 200);
    const bob = await fetch(`${base}/data`, { headers: { "x-test-session": "bob" } });
    const alice = await fetch(`${base}/data`, { headers: { "x-test-session": "alice" } });
    const bobData = await bob.json() as AccountData;
    const aliceData = await alice.json() as AccountData;
    assert.deepEqual(bobData.preferences?.cities, ["Oakland"]);
    assert.equal(aliceData.preferences, null);
  } finally {
    server.close();
    await once(server, "close");
  }
});
