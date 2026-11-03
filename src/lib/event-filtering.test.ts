import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../data/events";
import type { EventItem } from "../types";
import { filterEvents } from "./event-filtering";

const now = Date.parse("2027-01-01T12:00:00.000Z");
const eventAt = (id: string, daysFromNow: number, overrides: Partial<EventItem> = {}): EventItem => ({
  ...demoEvents[0],
  id,
  start: new Date(now + daysFromNow * 24 * 60 * 60 * 1000).toISOString(),
  end: new Date(now + daysFromNow * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
  city: "Berkeley",
  topics: ["AI & Tech"],
  formats: ["Workshop"],
  ...overrides,
});

test("event filters combine multi-selects and sort matching events by start time", () => {
  const later = eventAt("later", 4, { topics: ["AI & Tech", "Startups"] });
  const earlier = eventAt("earlier", 1, { topics: ["Startups"] });
  const wrongFormat = eventAt("format", 2, { formats: ["Demo"] });
  const wrongCity = eventAt("city", 2, { city: "San Francisco" });
  const outsideHorizon = eventAt("outside", 20);
  const past = eventAt("past", -2);

  const result = filterEvents(
    [later, wrongFormat, wrongCity, outsideHorizon, earlier, past],
    {
      preferences: { ...DEFAULT_PREFERENCES, cities: ["Berkeley"], dateHorizonDays: 14 },
      availabilityByEvent: { later: "conflict", earlier: "conflict", format: "conflict" },
      attendanceByEventId: {},
      savedEventIds: ["later", "earlier"],
      selectedTopics: ["AI & Tech", "Startups"],
      selectedFormats: ["Workshop", "Hackathon"],
      availabilityFilter: "conflict",
      attendanceStatusFilter: "all",
      savedOnly: true,
      now,
    },
  );

  assert.deepEqual(result.map((event) => event.id), ["earlier", "later"]);
});

test("empty topic and format selections allow all matching availability states", () => {
  const available = eventAt("available", 1);
  const unknown = eventAt("unknown", 2, { topics: ["Social Impact"], formats: ["Networking"] });
  const result = filterEvents(
    [unknown, available],
    {
      preferences: { ...DEFAULT_PREFERENCES, cities: [], dateHorizonDays: 14 },
      availabilityByEvent: { available: "available", unknown: "unknown" },
      attendanceByEventId: {},
      savedEventIds: [],
      selectedTopics: [],
      selectedFormats: [],
      availabilityFilter: "all",
      attendanceStatusFilter: "all",
      savedOnly: false,
      now,
    },
  );
  assert.deepEqual(result.map((event) => event.id), ["available", "unknown"]);
});

test("attendance filters apply only in My Events and default older saves to Interested", () => {
  const interested = eventAt("interested", 1);
  const planning = eventAt("planning", 2);
  const registered = eventAt("registered", 3);
  const unsaved = eventAt("unsaved", 4);
  const options = {
    preferences: { ...DEFAULT_PREFERENCES, cities: [], dateHorizonDays: 14 },
    availabilityByEvent: {},
    attendanceByEventId: {
      planning: "planning_to_attend" as const,
      registered: "registered" as const,
    },
    savedEventIds: ["interested", "planning", "registered"],
    selectedTopics: [],
    selectedFormats: [],
    availabilityFilter: "all" as const,
    attendanceStatusFilter: "interested" as const,
    savedOnly: true,
    now,
  };

  assert.deepEqual(
    filterEvents([registered, planning, interested], options).map((event) => event.id),
    ["interested"],
  );
  assert.deepEqual(
    filterEvents([registered, planning, interested], {
      ...options,
      attendanceStatusFilter: "planning_to_attend",
    }).map((event) => event.id),
    ["planning"],
  );
  assert.deepEqual(
    filterEvents([registered, planning, interested], {
      ...options,
      attendanceStatusFilter: "registered",
    }).map((event) => event.id),
    ["registered"],
  );
  assert.deepEqual(
    filterEvents([unsaved, registered, planning, interested], {
      ...options,
      attendanceStatusFilter: "all",
    }).map((event) => event.id),
    ["interested", "planning", "registered"],
  );
});

test("attendance status filters do not change Full Discover results", () => {
  const interested = eventAt("interested", 1);
  const registered = eventAt("registered", 2);
  const result = filterEvents([registered, interested], {
    preferences: { ...DEFAULT_PREFERENCES, cities: [], dateHorizonDays: 14 },
    availabilityByEvent: {},
    attendanceByEventId: { registered: "registered" },
    savedEventIds: [],
    selectedTopics: [],
    selectedFormats: [],
    availabilityFilter: "all",
    attendanceStatusFilter: "registered",
    savedOnly: false,
    now,
  });

  assert.deepEqual(result.map((event) => event.id), ["interested", "registered"]);
});
