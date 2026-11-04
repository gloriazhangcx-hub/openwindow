import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../src/data/events";
import type { AttendanceStatus, BusyInterval, EventItem, Preferences } from "../src/types";
import type { AccountData, AccountStore, LegacyRawValues, MigrationResult } from "./account-store";
import { createAccountRouter } from "./account-routes";

class MemoryStore implements AccountStore {
  private readonly rows = new Map<string, AccountData>();

  private row(userId: string): AccountData {
    const existing = this.rows.get(userId);
    if (existing) return existing;
    const created: AccountData = {
      preferences: null,
      starredEvents: [],
      manualEvents: [],
      attendanceByEventId: {},
      busyIntervals: [],
    };
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
      if (!row.starredEvents.some((item) => item.id === event.id)) {
        row.starredEvents.push(event);
        row.attendanceByEventId[event.id] = "interested";
      }
    }
    return { starredEvents: row.starredEvents.length, busyIntervals: 0, preferencesImported: false, snapshotStored: true };
  }

  async setStarredEvent(userId: string, event: EventItem, starred: boolean) {
    if (event.source === "Manual") return;
    const row = this.row(userId);
    if (starred && !row.starredEvents.some((item) => item.id === event.id)) {
      row.starredEvents.push(event);
      row.attendanceByEventId[event.id] ??= "interested";
    }
    if (!starred) {
      row.starredEvents = row.starredEvents.filter((item) => item.id !== event.id);
      delete row.attendanceByEventId[event.id];
    }
  }

  async updateAttendanceStatus(userId: string, eventId: string, status: AttendanceStatus) {
    const row = this.row(userId);
    if (!row.starredEvents.some((item) => item.id === eventId)) return false;
    row.attendanceByEventId[eventId] = status;
    return true;
  }

  async createManualEvent(userId: string, input: import("../src/types").ManualEventInput) {
    const row = this.row(userId);
    const event: EventItem = {
      id: `manual:00000000-0000-4000-8000-${String(row.manualEvents.length + 1).padStart(12, "0")}`,
      title: input.title,
      description: input.description,
      start: input.start,
      end: input.end,
      timeZone: input.timeZone,
      city: "",
      venue: input.location,
      location: input.location,
      eventUrl: input.eventUrl,
      topics: input.topics,
      formats: input.formats,
      source: "Manual",
      lumaUrl: "",
    };
    row.manualEvents.push(event);
    row.attendanceByEventId[event.id] = "interested";
    return event;
  }

  async updateManualEvent(userId: string, eventId: string, input: import("../src/types").ManualEventInput) {
    const row = this.row(userId);
    const existing = row.manualEvents.find((event) => event.id === `manual:${eventId}`);
    if (!existing) return null;
    const updated: EventItem = {
      ...existing,
      title: input.title,
      description: input.description,
      start: input.start,
      end: input.end,
      timeZone: input.timeZone,
      location: input.location,
      venue: input.location,
      eventUrl: input.eventUrl,
      topics: input.topics,
      formats: input.formats,
    };
    row.manualEvents = row.manualEvents.map((event) => event.id === existing.id ? updated : event);
    return updated;
  }

  async deleteManualEvent(userId: string, eventId: string) {
    const row = this.row(userId);
    const id = `manual:${eventId}`;
    if (!row.manualEvents.some((event) => event.id === id)) return false;
    row.manualEvents = row.manualEvents.filter((event) => event.id !== id);
    delete row.attendanceByEventId[id];
    return true;
  }

  async updateManualEventAttendance(userId: string, eventId: string, status: AttendanceStatus) {
    const row = this.row(userId);
    const id = `manual:${eventId}`;
    if (!row.manualEvents.some((event) => event.id === id)) return false;
    row.attendanceByEventId[id] = status;
    return true;
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

test("Star routes use one relationship and isolate it across authenticated users", async () => {
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
  const event = demoEvents[0];
  const data = async (user: string) =>
    (await fetch(`${base}/data`, { headers: { "x-test-session": user } })).json() as Promise<AccountData>;
  const write = (path: string, user: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-test-session": user },
      body: JSON.stringify(body),
    });

  try {
    assert.equal((await write("/stars", "alice", { event, starred: true })).status, 200);
    const aliceAfterStar = await data("alice");
    assert.deepEqual(aliceAfterStar.starredEvents.map((item) => item.id), [event.id]);
    assert.deepEqual((await data("bob")).starredEvents, []);

    assert.equal((await write("/stars", "alice", { event, starred: true })).status, 200);
    assert.deepEqual((await data("alice")).starredEvents.map((item) => item.id), [event.id]);

    assert.equal((await write("/stars", "alice", { event, starred: false })).status, 200);
    assert.deepEqual((await data("alice")).starredEvents, []);
    const spoofedStar = await write("/stars", "alice", { event, starred: true, userId: "bob" });
    assert.equal(spoofedStar.status, 400);
    const unauthenticatedStar = await fetch(`${base}/stars`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, starred: true }),
    });
    assert.equal(unauthenticatedStar.status, 401);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("Star attendance updates validate status and stay private to the Star owner", async () => {
  const store = new MemoryStore();
  const event = demoEvents[0];
  await store.setStarredEvent("alice", event, true);

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
  const update = (user: string, status: unknown) => fetch(`${base}/stars/attendance`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-test-session": user },
    body: JSON.stringify({ eventId: event.id, status }),
  });

  try {
    for (const status of ["interested", "planning_to_attend", "registered"]) {
      const response = await update("alice", status);
      assert.equal(response.status, 200);
    }

    const invalidWrite = await update("alice", "attending");
    assert.equal(invalidWrite.status, 400);

    const spoofedWrite = await fetch(`${base}/stars/attendance`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-test-session": "alice" },
      body: JSON.stringify({ eventId: event.id, status: "interested", userId: "bob" }),
    });
    assert.equal(spoofedWrite.status, 400);

    const unauthenticatedWrite = await fetch(`${base}/stars/attendance`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: event.id, status: "registered" }),
    });
    assert.equal(unauthenticatedWrite.status, 401);

    const bobWrite = await update("bob", "registered");
    assert.equal(bobWrite.status, 404);

    const aliceData = await (await fetch(`${base}/data`, {
      headers: { "x-test-session": "alice" },
    })).json() as AccountData;
    const bobData = await (await fetch(`${base}/data`, {
      headers: { "x-test-session": "bob" },
    })).json() as AccountData;
    assert.equal(aliceData.attendanceByEventId[event.id], "registered");
    assert.deepEqual(bobData.starredEvents, []);
    assert.deepEqual(bobData.attendanceByEventId, {});
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("manual event routes validate inputs and isolate create, edit, status, and delete by account", async () => {
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
  const input = {
    title: "Community Workshop",
    description: "Meet local builders.",
    start: "2027-01-03T18:00:00.000Z",
    end: "2027-01-03T20:00:00.000Z",
    timeZone: "America/Los_Angeles",
    location: "Berkeley",
    eventUrl: "https://example.com/events/workshop",
    topics: ["AI & Tech"],
    formats: ["Workshop"],
  };
  const request = (path: string, user: string, method = "GET", body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        "x-test-session": user,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  try {
    const spoofedCreate = await request("/manual-events", "alice", "POST", { ...input, userId: "bob" });
    assert.equal(spoofedCreate.status, 400);
    const invalidCreate = await request("/manual-events", "alice", "POST", {
      ...input,
      end: "2027-01-03T17:00:00.000Z",
    });
    assert.equal(invalidCreate.status, 400);
    const invalidDateCreate = await request("/manual-events", "alice", "POST", {
      ...input,
      start: "2027-02-30T18:00:00.000Z",
    });
    assert.equal(invalidDateCreate.status, 400);
    const invalidUrlCreate = await request("/manual-events", "alice", "POST", {
      ...input,
      eventUrl: "javascript:alert(1)",
    });
    assert.equal(invalidUrlCreate.status, 400);

    const createdResponse = await request("/manual-events", "alice", "POST", input);
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json() as { event: EventItem }).event;
    assert.match(created.id, /^manual:[0-9a-f-]{36}$/i);
    assert.equal(created.source, "Manual");
    assert.equal(created.location, "Berkeley");

    const aliceData = await (await request("/data", "alice")).json() as AccountData;
    const bobData = await (await request("/data", "bob")).json() as AccountData;
    assert.equal(aliceData.manualEvents.length, 1);
    assert.equal(aliceData.attendanceByEventId[created.id], "interested");
    assert.deepEqual(aliceData.starredEvents, []);
    assert.deepEqual(bobData.manualEvents, []);
    assert.deepEqual(bobData.attendanceByEventId, {});

    const eventId = created.id.slice("manual:".length);
    const edited = await request(`/manual-events/${eventId}`, "alice", "PUT", {
      ...input,
      title: "Updated Workshop",
    });
    assert.equal(edited.status, 200);
    assert.equal(((await edited.json()) as { event: EventItem }).event.title, "Updated Workshop");
    assert.equal((await request(`/manual-events/${eventId}`, "bob", "PUT", input)).status, 404);
    assert.equal((await request(`/manual-events/${eventId}/attendance`, "bob", "PUT", { status: "registered" })).status, 404);
    assert.equal((await request(`/manual-events/${eventId}/attendance`, "alice", "PUT", { status: "registered" })).status, 200);

    const bobDelete = await request(`/manual-events/${eventId}`, "bob", "DELETE");
    assert.equal(bobDelete.status, 404);
    const aliceDelete = await request(`/manual-events/${eventId}`, "alice", "DELETE");
    assert.equal(aliceDelete.status, 200);
    assert.deepEqual((await (await request("/data", "alice")).json() as AccountData).manualEvents, []);
    assert.equal((await request("/manual-events", "alice", "POST", input)).status, 201);
    assert.equal((await fetch(`${base}/manual-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    })).status, 401);
  } finally {
    server.close();
    await once(server, "close");
  }
});
