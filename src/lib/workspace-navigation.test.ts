import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { PrimaryNavigation } from "../components/PrimaryNavigation";
import { getEventView, INITIAL_WORKSPACE_TAB, type WorkspaceTab } from "./workspace-navigation";

test("a fresh workspace opens on Discover", () => {
  assert.equal(INITIAL_WORKSPACE_TAB, "discover");
  assert.equal(getEventView(INITIAL_WORKSPACE_TAB), "list");
});

test("all three primary views map to their existing content", () => {
  const expected: [WorkspaceTab, "list" | "calendar"][] = [
    ["discover", "list"],
    ["calendar", "calendar"],
    ["my-events", "list"],
  ];

  for (const [tab, view] of expected) {
    assert.equal(getEventView(tab), view);
  }
});

test("primary navigation renders three equally styled choices with one active state", () => {
  for (const activeTab of ["discover", "calendar", "my-events"] as const) {
    const markup = renderToStaticMarkup(createElement(PrimaryNavigation, {
      activeTab,
      eventCount: 4,
      onSelect: () => {},
    }));
    const buttonCount = (markup.match(/<button\b/g) ?? []).length;
    const selectedCount = (markup.match(/aria-pressed="true"/g) ?? []).length;

    assert.equal(buttonCount, 3);
    assert.equal(selectedCount, 1);
    assert.match(markup, />Discover<\/span>/);
    assert.match(markup, />My Events<\/span>/);
    assert.match(markup, />Calendar<\/span>/);
    const discoverPosition = markup.indexOf(">Discover</span>");
    const myEventsPosition = markup.indexOf(">My Events</span>");
    const calendarPosition = markup.indexOf(">Calendar</span>");
    assert.ok(discoverPosition < myEventsPosition && myEventsPosition < calendarPosition);
    assert.match(markup, /class="view-tab-count"/);
    assert.doesNotMatch(markup, />List<\/span>|my-events-toggle|Full Discover/);
    assert.match(markup, new RegExp(`aria-label="${activeTab === "my-events" ? "My Events, 4 events" : activeTab === "calendar" ? "Calendar" : "Discover"}"`));
  }
});
