import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../data/events";
import type { BusyInterval, EventItem } from "../types";
import { getCalendarDayBlocks } from "./calendar-blocks";
import { getAvailability } from "./calendar";
import { filterEvents } from "./event-filtering";

const now = Date.parse("2027-01-01T12:00:00.000Z");
const manualEvent: EventItem = {
  ...demoEvents[0],
  id: "manual:00000000-0000-4000-8000-000000000001",
  title: "Community Design Workshop",
  description: "A personal event I found elsewhere.",
  start: "2027-02-15T18:00:00.000Z",
  end: "2027-02-15T20:00:00.000Z",
  timeZone: "America/Los_Angeles",
  city: "",
  venue: "Oakland",
  location: "Oakland",
  source: "Manual",
  lumaUrl: "",
  eventUrl: "https://example.com/workshop",
  topics: ["Social Impact"],
  formats: ["Workshop"],
};

test("personal events appear in My Events despite discovery city and date-horizon defaults", () => {
  const filtered = filterEvents([manualEvent], {
    preferences: { ...DEFAULT_PREFERENCES, cities: ["San Francisco"], dateHorizonDays: 1 },
    availabilityByEvent: { [manualEvent.id]: "available" },
    attendanceByEventId: { [manualEvent.id]: "interested" },
    starredEventIds: [],
    selectedTopics: [],
    selectedFormats: [],
    availabilityFilter: "all",
    attendanceStatusFilter: "all",
    myEventsOnly: true,
    now,
  });
  assert.deepEqual(filtered.map((event) => event.id), [manualEvent.id]);
});

test("manual calendar cards remain suggested, retain conflicts, and show attendance status", () => {
  const busy: BusyInterval[] = [{
    start: "2027-02-15T18:30:00.000Z",
    end: "2027-02-15T19:00:00.000Z",
    timeZone: "America/Los_Angeles",
    sourceId: "personal-calendar",
  }];
  const availability = { [manualEvent.id]: getAvailability(manualEvent, busy) };
  const blocks = getCalendarDayBlocks(
    new Date("2027-02-15T12:00:00.000Z"),
    [manualEvent],
    busy,
    availability,
    [],
    { [manualEvent.id]: "registered" },
  );
  const eventBlock = blocks.find((block) => block.kind === "event");
  const busyBlock = blocks.find((block) => block.kind === "busy");
  assert.ok(eventBlock && eventBlock.kind === "event");
  assert.ok(busyBlock && busyBlock.kind === "busy");
  assert.equal(eventBlock.availability, "conflict");
  assert.equal(eventBlock.attendanceStatus, "registered");
});
