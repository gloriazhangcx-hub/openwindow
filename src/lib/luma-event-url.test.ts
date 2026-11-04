import assert from "node:assert/strict";
import { test } from "node:test";
import { demoEvents } from "../data/events";
import { isValidLumaEventUrl } from "./luma-event-url";

test("Luma event URL validator accepts canonical public event pages", () => {
  assert.equal(isValidLumaEventUrl("https://luma.com/d8tc595x"), true);
  assert.equal(isValidLumaEventUrl("https://lu.ma/example-event?source=openwindow"), true);
});

test("Luma event URL validator rejects placeholders and unrelated or unsafe URLs", () => {
  for (const value of [
    "https://lu.ma",
    "https://luma.com/",
    "http://luma.com/d8tc595x",
    "https://example.com/d8tc595x",
    "https://luma.com/calendar/some-calendar",
    "https://user:pass@luma.com/d8tc595x",
    "not a url",
  ]) {
    assert.equal(isValidLumaEventUrl(value), false, value);
  }
});

test("fictional demo events stay distinct from event-specific Luma URLs", () => {
  assert.equal(demoEvents.length, 10);
  assert.ok(demoEvents.every((event) => event.source === "Demo" && event.sourceUrl === undefined));
});
