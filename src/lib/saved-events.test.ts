import assert from "node:assert/strict";
import test from "node:test";
import { findNearestUpcomingSavedEvent } from "./saved-events";

test("finds the closest upcoming saved event regardless of input order", () => {
  const events = [
    { id: "later", start: "2026-10-28T18:00:00Z" },
    { id: "unsaved-soon", start: "2026-10-26T17:00:00Z" },
    { id: "soon", start: "2026-10-26T16:00:00Z" },
  ];

  const result = findNearestUpcomingSavedEvent(
    events,
    ["later", "soon"],
    Date.parse("2026-10-25T12:00:00Z"),
  );

  assert.equal(result?.id, "soon");
});

test("ignores past and invalid saved event times", () => {
  const events = [
    { id: "past", start: "2026-10-24T16:00:00Z" },
    { id: "invalid", start: "not-a-date" },
  ];

  assert.equal(
    findNearestUpcomingSavedEvent(events, ["past", "invalid"], Date.parse("2026-10-25T12:00:00Z")),
    undefined,
  );
});
