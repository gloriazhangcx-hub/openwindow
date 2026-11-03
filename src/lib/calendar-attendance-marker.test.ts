import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { CalendarAttendanceMarker } from "../components/CalendarAttendanceMarker";

test("calendar attendance markers expose the full status accessibly", () => {
  const statuses = [
    ["interested", "Interested"],
    ["planning_to_attend", "Planning to Attend"],
    ["registered", "Registered"],
  ] as const;

  for (const [status, label] of statuses) {
    const markup = renderToStaticMarkup(
      createElement(CalendarAttendanceMarker, { status }),
    );
    assert.match(markup, new RegExp(`aria-label="Attendance status: ${label}"`));
    assert.match(markup, new RegExp(`title="Attendance status: ${label}"`));
    assert.match(markup, /aria-hidden="true"/);
  }
});
