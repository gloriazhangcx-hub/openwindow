import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAvailability, intervalsOverlap } from "./calendar";

describe("calendar conflict detection", () => {
  const eventStart = "2026-10-26T18:00:00-07:00";
  const eventEnd = "2026-10-26T20:00:00-07:00";

  it("detects a full overlap", () => {
    assert.equal(intervalsOverlap(eventStart, eventEnd, "2026-10-26T18:30:00-07:00", "2026-10-26T19:00:00-07:00"), true);
  });

  it("detects overlap when either interval contains the other", () => {
    assert.equal(intervalsOverlap(eventStart, eventEnd, "2026-10-26T17:00:00-07:00", "2026-10-26T21:00:00-07:00"), true);
    assert.equal(intervalsOverlap("2026-10-26T18:30:00-07:00", "2026-10-26T19:00:00-07:00", eventStart, eventEnd), true);
  });

  it("treats touching interval boundaries as available", () => {
    assert.equal(intervalsOverlap(eventStart, eventEnd, "2026-10-26T16:00:00-07:00", eventStart), false);
    assert.equal(intervalsOverlap(eventStart, eventEnd, eventEnd, "2026-10-26T21:00:00-07:00"), false);
  });

  it("compares absolute instants across time zones and DST offsets", () => {
    assert.equal(intervalsOverlap("2026-11-01T01:30:00-07:00", "2026-11-01T02:30:00-08:00", "2026-11-01T09:45:00Z", "2026-11-01T10:15:00Z"), true);
  });

  it("returns Unknown when no calendar data or event time is missing/invalid", () => {
    assert.equal(getAvailability({ start: eventStart, end: eventEnd }, null), "unknown");
    assert.equal(getAvailability({ start: "", end: eventEnd }, []), "unknown");
    assert.equal(getAvailability({ start: eventEnd, end: eventStart }, []), "unknown");
  });

  it("returns Available with synced data and no overlap", () => {
    assert.equal(getAvailability({ start: eventStart, end: eventEnd }, [
      { start: "2026-10-26T20:00:00-07:00", end: "2026-10-26T21:00:00-07:00" },
    ]), "available");
  });

  it("returns Conflict for any overlapping busy interval", () => {
    assert.equal(getAvailability({ start: eventStart, end: eventEnd }, [
      { start: "2026-10-26T19:30:00-07:00", end: "2026-10-26T20:30:00-07:00" },
    ]), "conflict");
  });
});
