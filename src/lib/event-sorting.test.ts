import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../data/events";
import type { EventItem } from "../types";
import { filterEvents, type EventFilterOptions } from "./event-filtering";
import { sortEventsByStart } from "./event-sorting";

const now = Date.parse("2027-01-01T12:00:00.000Z");
const eventAt = (id: string, start: string, overrides: Partial<EventItem> = {}): EventItem => ({
  ...demoEvents[0],
  id,
  start,
  end: new Date(Date.parse(start) + 60 * 60 * 1000).toISOString(),
  city: "Berkeley",
  topics: ["AI & Tech"],
  formats: ["Workshop"],
  ...overrides,
});

test("date sorting defaults to soonest first and keeps equal start times stable", () => {
  const tieOne = eventAt("tie-one", "2027-01-08T18:00:00.000Z");
  const tieTwo = eventAt("tie-two", "2027-01-08T18:00:00.000Z");
  const events = [
    eventAt("latest", "2027-01-12T18:00:00.000Z"),
    tieTwo,
    eventAt("soonest", "2027-01-04T18:00:00.000Z"),
    tieOne,
  ];

  assert.deepEqual(
    sortEventsByStart(events).map((event) => event.id),
    ["soonest", "tie-two", "tie-one", "latest"],
  );
  assert.deepEqual(
    sortEventsByStart(events, "latest").map((event) => event.id),
    ["latest", "tie-two", "tie-one", "soonest"],
  );
  assert.deepEqual(events.map((event) => event.id), ["latest", "tie-two", "soonest", "tie-one"]);
});

test("latest-first sorting puts date groups and events within each group in descending order", () => {
  const events = [
    eventAt("jan-2-late", "2027-01-02T20:00:00.000Z"),
    eventAt("jan-1", "2027-01-01T18:00:00.000Z"),
    eventAt("jan-2-early", "2027-01-02T10:00:00.000Z"),
  ];
  const sorted = sortEventsByStart(events, "latest");
  const groups = new Map<string, string[]>();
  for (const event of sorted) {
    const key = event.start.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), event.id]);
  }

  assert.deepEqual([...groups.keys()], ["2027-01-02", "2027-01-01"]);
  assert.deepEqual(groups.get("2027-01-02"), ["jan-2-late", "jan-2-early"]);
});

test("sorting search/filter results changes order without changing which events match", () => {
  const laterMatch = eventAt("later-match", "2027-01-10T18:00:00.000Z", {
    title: "Founder networking night",
    topics: ["Startups"],
    formats: ["Networking"],
  });
  const soonerMatch = eventAt("sooner-match", "2027-01-05T18:00:00.000Z", {
    title: "Founder workshop",
    topics: ["Startups"],
    formats: ["Workshop"],
  });
  const wrongTopic = eventAt("wrong-topic", "2027-01-03T18:00:00.000Z", {
    title: "Founder networking night",
    topics: ["Social Impact"],
    formats: ["Networking"],
  });
  const options: EventFilterOptions = {
    preferences: { ...DEFAULT_PREFERENCES, cities: ["Berkeley"], dateHorizonDays: 30 },
    availabilityByEvent: {},
    attendanceByEventId: {},
    starredEventIds: [],
    selectedTopics: ["Startups"],
    selectedFormats: [],
    availabilityFilter: "all" as const,
    attendanceStatusFilter: "all" as const,
    myEventsOnly: false,
    searchQuery: "founder",
    now,
  };
  const matching = filterEvents([laterMatch, wrongTopic, soonerMatch], options);

  assert.deepEqual(matching.map((event) => event.id), ["sooner-match", "later-match"]);
  assert.deepEqual(
    sortEventsByStart(matching, "latest").map((event) => event.id),
    ["later-match", "sooner-match"],
  );
  assert.deepEqual(options.selectedTopics, ["Startups"]);
  assert.equal(options.searchQuery, "founder");
});

test("events with invalid start times sort after valid events in either direction", () => {
  const valid = eventAt("valid", "2027-01-05T18:00:00.000Z");
  const invalid = { ...valid, id: "invalid", start: "not-a-date" };

  assert.deepEqual(sortEventsByStart([invalid, valid]).map((event) => event.id), ["valid", "invalid"]);
  assert.deepEqual(sortEventsByStart([invalid, valid], "latest").map((event) => event.id), ["valid", "invalid"]);
});
