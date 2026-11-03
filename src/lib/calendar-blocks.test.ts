import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFERENCES, demoEvents } from "../data/events";
import type { BusyInterval, EventItem } from "../types";
import { getAvailability } from "./calendar";
import { countCalendarBusyIntervalsForDay, getCalendarDayBlocks, getCalendarEventAccessibleLabel } from "./calendar-blocks";
import { filterEvents } from "./event-filtering";

const now = Date.parse("2027-01-01T12:00:00.000Z");
const eventAt = (id: string, hour: number, overrides: Partial<EventItem> = {}): EventItem => ({
  ...demoEvents[0],
  id,
  start: `2027-01-03T${String(hour).padStart(2, "0")}:00:00.000Z`,
  end: `2027-01-03T${String(hour + 2).padStart(2, "0")}:00:00.000Z`,
  timeZone: "America/Los_Angeles",
  city: "Berkeley",
  ...overrides,
});

test("My Events status filtering leaves personal commitments visible and conflicts unchanged", () => {
  const interested = eventAt("interested", 17);
  const registered = eventAt("registered", 17);
  const busy: BusyInterval[] = [{
    start: "2027-01-03T18:00:00.000Z",
    end: "2027-01-03T19:00:00.000Z",
    timeZone: "America/Los_Angeles",
    sourceId: "local-calendar",
  }];
  const availability = {
    interested: getAvailability(interested, busy),
    registered: getAvailability(registered, busy),
  };
  const filtered = filterEvents([interested, registered], {
    preferences: { ...DEFAULT_PREFERENCES, cities: [], dateHorizonDays: 14 },
    availabilityByEvent: availability,
    attendanceByEventId: { interested: "interested", registered: "registered" },
    savedEventIds: ["interested", "registered"],
    selectedTopics: [],
    selectedFormats: [],
    availabilityFilter: "all",
    attendanceStatusFilter: "registered",
    savedOnly: true,
    now,
  });

  assert.deepEqual(filtered.map((event) => event.id), ["registered"]);
  assert.equal(availability.registered, "conflict");
  assert.equal(countCalendarBusyIntervalsForDay(new Date(2027, 0, 3, 12), busy), 1);

  const blocks = getCalendarDayBlocks(
    new Date(2027, 0, 3, 12),
    filtered,
    busy,
    availability,
    ["registered"],
    { registered: "registered" },
  );
  assert.deepEqual(blocks.map((block) => block.kind), ["event", "busy"]);
  assert.equal(blocks[0].kind === "event" ? blocks[0].availability : null, "conflict");
  assert.equal(blocks[1].kind === "busy" ? blocks[1].interval : null, busy[0]);
});

test("calendar event accessible labels include attendance status without replacing conflict state", () => {
  const event = eventAt("registered", 17, { title: "Founders Breakfast" });
  assert.equal(
    getCalendarEventAccessibleLabel(event, "conflict", "registered"),
    "Founders Breakfast, Conflict, Attendance status: Registered",
  );
});
