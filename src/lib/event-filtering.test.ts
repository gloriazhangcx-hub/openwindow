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
      savedEventIds: ["later", "earlier"],
      selectedTopics: ["AI & Tech", "Startups"],
      selectedFormats: ["Workshop", "Hackathon"],
      availabilityFilter: "conflict",
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
      savedEventIds: [],
      selectedTopics: [],
      selectedFormats: [],
      availabilityFilter: "all",
      savedOnly: false,
      now,
    },
  );
  assert.deepEqual(result.map((event) => event.id), ["available", "unknown"]);
});
