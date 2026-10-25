import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyEvent } from "./classification";

describe("event classification", () => {
  it("classifies topics and formats independently from text", () => {
    assert.deepEqual(
      classifyEvent("Climate AI Hackathon", "A community build weekend for climate resilience."),
      { topics: ["AI & Tech", "Social Impact"], formats: ["Hackathon"] },
    );
  });

  it("allows more than one format for mixed events", () => {
    assert.deepEqual(
      classifyEvent("Founder demo and networking night", "A community meetup."),
      { topics: ["Startups"], formats: ["Demo", "Networking"] },
    );
  });

  it("prefers recognized native labels and returns empty labels when unknown", () => {
    assert.deepEqual(
      classifyEvent("Something new", "No matching keywords.", ["AI & Tech", "Workshop"]),
      { topics: ["AI & Tech"], formats: ["Workshop"] },
    );
    assert.deepEqual(classifyEvent("Open house", "Community arts gathering"), { topics: [], formats: [] });
  });
});
