import assert from "node:assert/strict";
import test from "node:test";
import { getVisibleMinuteRange } from "./calendar-grid";

test("calendar grid includes evening events in the visible 8 AM–9 PM range", () => {
  const range = getVisibleMinuteRange(
    new Date("2026-10-26T18:00:00-07:00"),
    new Date("2026-10-26T20:00:00-07:00"),
    "America/Los_Angeles",
    8,
    21,
  );

  assert.deepEqual(range, {
    startMinute: 18 * 60,
    endMinute: 20 * 60,
    visibleStartMinute: 18 * 60,
    visibleEndMinute: 20 * 60,
  });
});

test("calendar grid clips events that overlap the visible hours", () => {
  const range = getVisibleMinuteRange(
    new Date("2026-10-26T07:30:00-07:00"),
    new Date("2026-10-26T09:00:00-07:00"),
    "America/Los_Angeles",
    8,
    21,
  );

  assert.equal(range?.visibleStartMinute, 8 * 60);
  assert.equal(range?.visibleEndMinute, 9 * 60);
});

test("calendar grid excludes events outside its visible hours", () => {
  const range = getVisibleMinuteRange(
    new Date("2026-10-26T06:00:00-07:00"),
    new Date("2026-10-26T07:00:00-07:00"),
    "America/Los_Angeles",
    8,
    21,
  );

  assert.equal(range, null);
});
