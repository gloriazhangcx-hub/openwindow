import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { demoEvents } from "../data/events";
import type { EventItem } from "../types";
import { getAvailability } from "./calendar";
import { calculateDiscoverSummary, calculateMyEventsSummary } from "./dashboard";

function eventWith(id: string, source: EventItem["source"] = "Demo"): EventItem {
  return { ...demoEvents[0], id, source };
}

describe("dashboard summaries", () => {
  it("returns consistent zero counts for empty Discover and My Events data", () => {
    assert.deepEqual(calculateDiscoverSummary([], {}), {
      totalEvents: 0,
      conflicts: 0,
      noConflicts: 0,
    });
    assert.deepEqual(calculateMyEventsSummary([], [], [], {}), {
      totalEvents: 0,
      fromDiscover: 0,
      addedByMe: 0,
      attendance: {
        interested: 0,
        planning_to_attend: 0,
        registered: 0,
      },
    });
  });

  it("counts only starred Discover events and manual events across both chart dimensions", () => {
    const fromDiscover = eventWith("discover-star", "Luma");
    const anotherDiscover = eventWith("discover-star-default");
    const manual = eventWith("manual:one", "Manual");
    const unstarredDiscover = eventWith("not-starred");
    const summary = calculateMyEventsSummary(
      [fromDiscover, anotherDiscover, manual, unstarredDiscover],
      [fromDiscover.id, anotherDiscover.id],
      [manual.id],
      {
        [fromDiscover.id]: "planning_to_attend",
        [manual.id]: "registered",
      },
    );

    assert.deepEqual(summary, {
      totalEvents: 3,
      fromDiscover: 2,
      addedByMe: 1,
      attendance: {
        interested: 1,
        planning_to_attend: 1,
        registered: 1,
      },
    });
    assert.equal(summary.fromDiscover + summary.addedByMe, summary.totalEvents);
    assert.equal(
      Object.values(summary.attendance).reduce((total, count) => total + count, 0),
      summary.totalEvents,
    );
  });

  it("counts unknown availability as No Conflicts without adding another metric", () => {
    const events = [eventWith("known-conflict"), eventWith("known-available"), eventWith("unknown")];
    const summary = calculateDiscoverSummary(events, {
      "known-conflict": "conflict",
      "known-available": "available",
      unknown: "unknown",
    });

    assert.deepEqual(summary, {
      totalEvents: 3,
      conflicts: 1,
      noConflicts: 2,
    });
    assert.equal(summary.conflicts + summary.noConflicts, summary.totalEvents);
  });

  it("Given a matching event, when calendar data gains an overlapping interval, then its counts move from No Conflicts to Conflicts", () => {
    // Given: one matching event and no known busy intervals.
    const event = {
      ...eventWith("changing-calendar-event"),
      start: "2027-02-10T18:00:00-08:00",
      end: "2027-02-10T20:00:00-08:00",
    };
    const initialAvailability = getAvailability(event, []);
    const before = calculateDiscoverSummary([event], { [event.id]: initialAvailability });
    assert.deepEqual(before, { totalEvents: 1, conflicts: 0, noConflicts: 1 });

    // When: the user imports a busy interval that overlaps the event.
    const updatedAvailability = getAvailability(event, [{
      start: "2027-02-10T18:30:00-08:00",
      end: "2027-02-10T19:00:00-08:00",
    }]);
    const after = calculateDiscoverSummary([event], { [event.id]: updatedAvailability });

    // Then: total remains stable while the conflict counts update immediately.
    assert.deepEqual(after, { totalEvents: 1, conflicts: 1, noConflicts: 0 });
    assert.equal(after.totalEvents, before.totalEvents);
  });

  it("Given saved events, when attendance changes, then the matching chart segment updates and totals stay consistent", () => {
    const starred = eventWith("status-change");
    const manual = eventWith("manual:status", "Manual");
    const collection = [starred, manual];
    const before = calculateMyEventsSummary(collection, [starred.id], [manual.id], {
      [starred.id]: "interested",
      [manual.id]: "registered",
    });

    const after = calculateMyEventsSummary(collection, [starred.id], [manual.id], {
      [starred.id]: "planning_to_attend",
      [manual.id]: "registered",
    });

    assert.equal(before.attendance.interested, 1);
    assert.equal(after.attendance.interested, 0);
    assert.equal(after.attendance.planning_to_attend, 1);
    assert.equal(after.totalEvents, 2);
    assert.equal(
      Object.values(after.attendance).reduce((total, count) => total + count, 0),
      after.totalEvents,
    );
  });

  it("Given a saved collection, when stars and manual events change, then source counts follow the current collection", () => {
    const firstStar = eventWith("first-star");
    const secondStar = eventWith("second-star");
    const manual = eventWith("manual:added");
    const allEvents = [firstStar, secondStar, manual];

    const before = calculateMyEventsSummary(allEvents, [firstStar.id], [], {
      [firstStar.id]: "interested",
    });
    assert.deepEqual(
      { total: before.totalEvents, discover: before.fromDiscover, manual: before.addedByMe },
      { total: 1, discover: 1, manual: 0 },
    );

    // When the user stars another suggestion and adds a manual event.
    const afterAdds = calculateMyEventsSummary(
      allEvents,
      [firstStar.id, secondStar.id],
      [manual.id],
      {
        [firstStar.id]: "interested",
        [secondStar.id]: "planning_to_attend",
        [manual.id]: "registered",
      },
    );
    assert.deepEqual(
      { total: afterAdds.totalEvents, discover: afterAdds.fromDiscover, manual: afterAdds.addedByMe },
      { total: 3, discover: 2, manual: 1 },
    );

    // Then unstar the first suggestion and delete the manual event.
    const afterRemovals = calculateMyEventsSummary(
      allEvents,
      [secondStar.id],
      [],
      { [secondStar.id]: "planning_to_attend" },
    );
    assert.deepEqual(
      { total: afterRemovals.totalEvents, discover: afterRemovals.fromDiscover, manual: afterRemovals.addedByMe },
      { total: 1, discover: 1, manual: 0 },
    );
  });
});
