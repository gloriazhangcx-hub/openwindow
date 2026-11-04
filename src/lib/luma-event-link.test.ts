import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { demoEvents } from "../data/events";
import { LumaEventLink } from "../components/LumaEventLink";

test("demo event link clearly opens the Luma homepage rather than an event registration page", () => {
  const event = demoEvents[0];
  const markup = renderToStaticMarkup(createElement(LumaEventLink, { event }));

  assert.match(markup, /href="https:\/\/lu\.ma\/"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, />Explore Luma \(Demo\) ↗<\/a>/);
  assert.match(markup, /demo link/);
  assert.doesNotMatch(markup, /Registered|attendance/i);
});

test("future Luma events use their valid stored sourceUrl and do not change attendance", () => {
  const event = {
    ...demoEvents[0],
    source: "Luma" as const,
    sourceUrl: "https://luma.com/d8tc595x",
  };

  const markup = renderToStaticMarkup(createElement(LumaEventLink, { event }));
  assert.match(markup, /href="https:\/\/luma\.com\/d8tc595x"/);
  assert.match(markup, />View on Luma ↗<\/a>/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.doesNotMatch(markup, /onClick|Registered|attendance/i);
});

test("future Luma link is hidden when its event-specific URL is missing or invalid", () => {
  const validLumaEvent = { ...demoEvents[0], source: "Luma" as const };
  const cases = [
    { ...validLumaEvent, sourceUrl: undefined },
    { ...validLumaEvent, sourceUrl: "https://lu.ma" },
    { ...validLumaEvent, sourceUrl: "https://example.com/unrelated" },
    { ...demoEvents[0], source: "Manual" as const, sourceUrl: "https://luma.com/d8tc595x" },
  ];

  for (const event of cases) {
    assert.equal(renderToStaticMarkup(createElement(LumaEventLink, { event })), "");
  }
});
