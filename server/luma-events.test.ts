import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLumaSearchPlans,
  normalizeLumaSearchResult,
  validateSearchPreferences,
} from "./luma-events";

test("Luma search plans cover each configured keyword and city within a bounded request count", () => {
  assert.deepEqual(
    buildLumaSearchPlans(["AI agents", "AI agents", "hackathon"], ["San Francisco", "Berkeley"]),
    [
      { query: "AI agents", location: "San Francisco" },
      { query: "hackathon", location: "San Francisco" },
      { query: "AI agents", location: "Berkeley" },
      { query: "hackathon", location: "Berkeley" },
    ],
  );
  assert.equal(buildLumaSearchPlans(Array.from({ length: 20 }, (_, i) => `topic ${i}`), ["SF", "Berkeley", "Oakland"]).length, 12);
  assert.deepEqual(buildLumaSearchPlans([], []), [{ query: "public events", location: "Bay Area" }]);
});

test("Luma preferences are bounded and normalized before reaching MCP", () => {
  assert.deepEqual(validateSearchPreferences({
    keywords: [" AI agents ", "", "workshop"],
    cities: [" Berkeley "],
    dateHorizonDays: 30,
  }), {
    keywords: ["AI agents", "workshop"],
    cities: ["Berkeley"],
    dateHorizonDays: 30,
  });
  assert.throws(() => validateSearchPreferences({ keywords: [], cities: [], dateHorizonDays: 31 }));
  assert.throws(() => validateSearchPreferences({ keywords: "AI", cities: [], dateHorizonDays: 14 }));
});

test("Luma structured search results map into the OpenWindow event model", () => {
  const events = normalizeLumaSearchResult({
    structuredContent: {
      events: [{
        event_id: "event-123",
        name: "AI Agents Workshop",
        description_md: "A hands-on workshop for local founders.",
        start_at: "2026-12-01T10:00:00-08:00",
        end_at: "2026-12-01T12:00:00-08:00",
        timezone: "America/Los_Angeles",
        url: "https://lu.ma/ai-agents-workshop",
        geo_address_json: { city: "San Francisco", name: "The Commons" },
        tags: ["AI & Tech", "Workshop", "Startups"],
      }],
    },
  });

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    id: "luma-event-123",
    title: "AI Agents Workshop",
    description: "A hands-on workshop for local founders.",
    start: "2026-12-01T18:00:00.000Z",
    end: "2026-12-01T20:00:00.000Z",
    timeZone: "America/Los_Angeles",
    city: "San Francisco",
    venue: "The Commons",
    topics: ["AI & Tech", "Startups"],
    formats: ["Workshop"],
    source: "Luma",
    lumaUrl: "https://lu.ma/ai-agents-workshop",
  });
});

test("Luma tool text content can contain a JSON event response", () => {
  const events = normalizeLumaSearchResult({
    content: [{
      type: "text",
      text: JSON.stringify({
        results: [{
          id: "event-456",
          title: "Bay Area Networking Night",
          start_time: "2026-11-10T18:00:00Z",
          location: "Oakland",
          slug: "bay-area-networking",
        }],
      }),
    }],
  }, "Oakland");

  assert.equal(events.length, 1);
  assert.equal(events[0].city, "Oakland");
  assert.equal(events[0].venue, "Oakland");
  assert.equal(events[0].lumaUrl, "https://lu.ma/bay-area-networking");
  assert.deepEqual(events[0].formats, ["Networking"]);
});

test("Luma empty results are accepted, but unknown response shapes fail explicitly", () => {
  assert.deepEqual(normalizeLumaSearchResult({ structuredContent: { events: [] } }), []);
  assert.throws(() => normalizeLumaSearchResult({ content: [{ type: "text", text: "Unexpected data" }] }));
});
