import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../data/events";
import type { EventItem } from "../types";
import { filterEvents, type EventFilterOptions } from "./event-filtering";

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

test("search matches every case-insensitive term in event titles or descriptions", () => {
  const titleMatch = eventAt("title", 1, {
    title: "OpenWindow Founder Meetup",
    description: "Meet people building useful products.",
  });
  const descriptionMatch = eventAt("description", 2, {
    title: "Community Gathering",
    description: "A welcoming WORKSHOP for early-stage founders.",
  });
  const missingTerm = eventAt("missing", 3, {
    title: "Founder breakfast",
    description: "Coffee and conversation.",
  });
  const result = filterEvents([missingTerm, descriptionMatch, titleMatch], {
    preferences: { ...DEFAULT_PREFERENCES, cities: [], dateHorizonDays: 14 },
    availabilityByEvent: {},
    attendanceByEventId: {},
    savedEventIds: [],
    selectedTopics: [],
    selectedFormats: [],
    availabilityFilter: "all",
    attendanceStatusFilter: "all",
    savedOnly: false,
    searchQuery: "  FOUNDER   workshop ",
    now,
  });

  assert.deepEqual(result.map((event) => event.id), ["description"]);
  const titleResult = filterEvents([titleMatch, descriptionMatch, missingTerm], {
    preferences: { ...DEFAULT_PREFERENCES, cities: [], dateHorizonDays: 14 },
    availabilityByEvent: {},
    attendanceByEventId: {},
    savedEventIds: [],
    selectedTopics: [],
    selectedFormats: [],
    availabilityFilter: "all",
    attendanceStatusFilter: "all",
    savedOnly: false,
    searchQuery: "openwindow meetup",
    now,
  });
  assert.deepEqual(titleResult.map((event) => event.id), ["title"]);
});

test("search combines with existing filters, and a cleared query preserves their results", () => {
  const matching = eventAt("matching", 1, {
    title: "Open data founders",
    description: "A community meetup.",
    topics: ["Startups"],
    formats: ["Networking"],
  });
  const wrongTopic = eventAt("topic", 2, { title: "Open data founders", topics: ["Social Impact"] });
  const wrongFormat = eventAt("format", 3, { title: "Open data founders", formats: ["Demo"] });
  const wrongAvailability = eventAt("availability", 4, { title: "Open data founders" });
  const noSearchTerm = eventAt("no-search", 2, {
    title: "Community founders",
    description: "A useful gathering.",
    topics: ["Startups"],
    formats: ["Networking"],
  });
  const events = [wrongAvailability, wrongFormat, wrongTopic, matching, noSearchTerm];
  const options: EventFilterOptions = {
    preferences: { ...DEFAULT_PREFERENCES, cities: [], dateHorizonDays: 14 },
    availabilityByEvent: {
      matching: "conflict" as const,
      topic: "conflict" as const,
      format: "conflict" as const,
      availability: "available" as const,
      "no-search": "conflict" as const,
    },
    attendanceByEventId: {},
    savedEventIds: [],
    selectedTopics: ["Startups"],
    selectedFormats: ["Networking"],
    availabilityFilter: "conflict",
    attendanceStatusFilter: "all",
    savedOnly: false,
    now,
  };
  const matchingResults = filterEvents(events, { ...options, searchQuery: "open founders" });
  const clearedSearchResults = filterEvents(events, { ...options, searchQuery: "  " });
  const noSearchResults = filterEvents(events, options);

  assert.deepEqual(matchingResults.map((event) => event.id), ["matching"]);
  assert.deepEqual(clearedSearchResults.map((event) => event.id), noSearchResults.map((event) => event.id));
  assert.deepEqual(noSearchResults.map((event) => event.id), ["matching", "no-search"]);
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
