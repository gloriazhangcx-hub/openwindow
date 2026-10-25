import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { demoBusyIntervals, demoEvents } from "./events";

describe("demo calendar seed data", () => {
  it("contains valid, future event and busy interval timestamps", () => {
    for (const event of demoEvents) {
      assert.ok(Number.isFinite(Date.parse(event.start)), `${event.id} has a valid start`);
      assert.ok(Number.isFinite(Date.parse(event.end)), `${event.id} has a valid end`);
      assert.ok(Date.parse(event.end) > Date.parse(event.start), `${event.id} ends after it starts`);
    }
    for (const interval of demoBusyIntervals) {
      assert.ok(Number.isFinite(Date.parse(interval.start)));
      assert.ok(Number.isFinite(Date.parse(interval.end)));
      assert.ok(Date.parse(interval.end) > Date.parse(interval.start));
    }
  });
});
