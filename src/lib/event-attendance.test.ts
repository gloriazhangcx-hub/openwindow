import assert from "node:assert/strict";
import { test } from "node:test";
import type { EventItem } from "../types";
import { shouldShowMyEventsAttendanceControl } from "./event-attendance";

const manualEvent = { id: "manual:1", source: "Manual" } satisfies Pick<EventItem, "id" | "source">;
const suggestedEvent = { id: "event:1", source: "Luma" } satisfies Pick<EventItem, "id" | "source">;

test("My Events list keeps attendance controls for unstarred manual events", () => {
  assert.equal(shouldShowMyEventsAttendanceControl(manualEvent, true, []), true);
});

test("My Events list shows attendance controls for starred suggestions only", () => {
  assert.equal(shouldShowMyEventsAttendanceControl(suggestedEvent, true, [suggestedEvent.id]), true);
  assert.equal(shouldShowMyEventsAttendanceControl(suggestedEvent, true, []), false);
});

test("list attendance controls remain scoped to My Events", () => {
  assert.equal(shouldShowMyEventsAttendanceControl(manualEvent, false, []), false);
  assert.equal(shouldShowMyEventsAttendanceControl(suggestedEvent, false, [suggestedEvent.id]), false);
});
