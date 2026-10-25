import assert from "node:assert/strict";
import test from "node:test";
import {
  getCalendarViewDays,
  navigateCalendarDate,
  startOfCalendarWeek,
} from "./calendar-views";

test("day view contains only its selected date", () => {
  const days = getCalendarViewDays(new Date(2026, 9, 27, 9), "day");
  assert.equal(days.length, 1);
  assert.equal(days[0].getDate(), 27);
  assert.equal(days[0].getHours(), 12);
});

test("week view starts Monday and contains seven days", () => {
  const days = getCalendarViewDays(new Date(2026, 9, 27, 9), "week");
  assert.equal(days.length, 7);
  assert.equal(days[0].getDay(), 1);
  assert.equal(days[0].getDate(), 26);
  assert.equal(days[6].getDate(), 1);
  assert.equal(days[6].getMonth(), 10);
});

test("month view shows a complete six-week Monday-to-Sunday grid", () => {
  const days = getCalendarViewDays(new Date(2026, 9, 27, 9), "month");
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.equal(days[0].getDate(), 28);
  assert.equal(days[0].getMonth(), 8);
  assert.equal(days[41].getDay(), 0);
});

test("navigation advances by the selected mode", () => {
  const date = new Date(2026, 0, 31, 9);
  assert.equal(navigateCalendarDate(date, "day", 1).getDate(), 1);
  assert.equal(navigateCalendarDate(date, "day", 1).getMonth(), 1);
  assert.equal(navigateCalendarDate(date, "week", 1).getDate(), 7);
  assert.equal(navigateCalendarDate(date, "month", 1).getDate(), 1);
  assert.equal(navigateCalendarDate(date, "month", 1).getMonth(), 1);
});

test("week start normalizes the selected date to Monday at noon", () => {
  const start = startOfCalendarWeek(new Date(2026, 9, 25, 18));
  assert.equal(start.getDay(), 1);
  assert.equal(start.getDate(), 19);
  assert.equal(start.getHours(), 12);
});
