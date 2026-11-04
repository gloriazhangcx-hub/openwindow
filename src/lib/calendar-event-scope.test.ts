import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../data/events";
import type { EventItem } from "../types";
import {
  DEFAULT_CALENDAR_EVENT_SCOPE,
  filterCalendarEvents,
} from "./calendar-event-scope";

const now = Date.parse("2027-01-01T12:00:00.000Z");

function eventAt(id: string, day: number, overrides: Partial<EventItem> = {}): EventItem {
  const start = new Date(Date.UTC(2027, 0, day, 17)).toISOString();
  return {
    ...demoEvents[0],
    id,
    start,
    end: new Date(Date.parse(start) + 60 * 60 * 1000).toISOString(),
    city: "Berkeley",
    ...overrides,
  };
}

const filterOptions = {
  preferences: { ...DEFAULT_PREFERENCES, cities: ["Berkeley"], dateHorizonDays: 14 },
  availabilityByEvent: {},
  attendanceByEventId: {},
  starredEventIds: ["starred"],
  selectedTopics: [],
  selectedFormats: [],
  availabilityFilter: "all" as const,
  searchQuery: "",
  now,
};

test("Calendar defaults to All Events and includes Discover plus manual events", () => {
  const unstarred = eventAt("unstarred", 2);
  const starred = eventAt("starred", 3);
  const manual = eventAt("manual", 4, { source: "Manual" });

  assert.equal(DEFAULT_CALENDAR_EVENT_SCOPE, "all");
  assert.deepEqual(
    filterCalendarEvents([unstarred, starred, manual], filterOptions, DEFAULT_CALENDAR_EVENT_SCOPE)
      .map((event) => event.id),
    ["unstarred", "starred", "manual"],
  );
});

test("My Events Only keeps starred and manual events but excludes unstarred Discover events", () => {
  const unstarred = eventAt("unstarred", 2);
  const starred = eventAt("starred", 3);
  const manual = eventAt("manual", 4, { source: "Manual" });

  assert.deepEqual(
    filterCalendarEvents([unstarred, starred, manual], filterOptions, "my-events")
      .map((event) => event.id),
    ["starred", "manual"],
  );
});

test("Calendar scope preserves matching search, topic, format, and availability filters", () => {
  const matching = eventAt("matching", 2, {
    title: "Founder Workshop",
    description: "A practical session",
    topics: ["Career & Industry"],
    formats: ["Workshop"],
  });
  const nonmatching = eventAt("nonmatching", 3, { title: "Design Social" });
  const filtered = filterCalendarEvents([matching, nonmatching], {
    ...filterOptions,
    selectedTopics: ["Career & Industry"],
    selectedFormats: ["Workshop"],
    availabilityByEvent: { matching: "available", nonmatching: "conflict" },
    availabilityFilter: "available",
    searchQuery: "FOUNDER",
  }, "all");

  assert.deepEqual(filtered.map((event) => event.id), ["matching"]);
});
