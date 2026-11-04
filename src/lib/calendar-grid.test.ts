import assert from "node:assert/strict";
import test from "node:test";
import { clipIntervalToCalendarDay, getCalendarDayBounds, getVisibleMinuteRange } from "./calendar-grid";

test("calendar grid positions evening events using the full 24-hour day", () => {
  const range = getVisibleMinuteRange(
    new Date("2026-11-04T04:29:00.000Z"),
    new Date("2026-11-04T07:29:00.000Z"),
    "America/Los_Angeles",
    0,
    24,
  );

  assert.deepEqual(range, {
    startMinute: 20 * 60 + 29,
    endMinute: 23 * 60 + 29,
    visibleStartMinute: 20 * 60 + 29,
    visibleEndMinute: 23 * 60 + 29,
  });
});

test("calendar grid positions early-morning events before the default 8 AM viewport", () => {
  const range = getVisibleMinuteRange(
    new Date("2026-11-04T14:00:00.000Z"),
    new Date("2026-11-04T15:00:00.000Z"),
    "America/Los_Angeles",
    0,
    24,
  );

  assert.equal(range?.visibleStartMinute, 6 * 60);
  assert.equal(range?.visibleEndMinute, 7 * 60);
});

test("calendar day clipping splits events that cross midnight into both days", () => {
  const start = new Date("2027-01-04T07:00:00.000Z");
  const end = new Date("2027-01-04T09:00:00.000Z");
  const firstDay = clipIntervalToCalendarDay(
    start,
    end,
    new Date(2027, 0, 3, 12),
    "America/Los_Angeles",
  );
  const nextDay = clipIntervalToCalendarDay(
    start,
    end,
    new Date(2027, 0, 4, 12),
    "America/Los_Angeles",
  );

  assert.deepEqual(firstDay, {
    start: new Date("2027-01-04T07:00:00.000Z"),
    end: new Date("2027-01-04T08:00:00.000Z"),
  });
  assert.deepEqual(nextDay, {
    start: new Date("2027-01-04T08:00:00.000Z"),
    end: new Date("2027-01-04T09:00:00.000Z"),
  });
});

test("calendar day clipping uses actual daylight-saving day boundaries", () => {
  const bounds = getCalendarDayBounds(new Date(2027, 2, 14, 12), "America/Los_Angeles");
  assert.equal(bounds.end.getTime() - bounds.start.getTime(), 23 * 60 * 60 * 1000);
});
