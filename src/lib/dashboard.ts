import type { AttendanceStatus, Availability, EventItem } from "../types";

export interface DiscoverSummary {
  totalEvents: number;
  conflicts: number;
  noConflicts: number;
}

export interface MyEventsSummary {
  totalEvents: number;
  fromDiscover: number;
  addedByMe: number;
  attendance: Record<AttendanceStatus, number>;
}

export function calculateDiscoverSummary(
  events: readonly Pick<EventItem, "id">[],
  availabilityByEvent: Readonly<Record<string, Availability>>,
): DiscoverSummary {
  const conflicts = events.filter((event) => availabilityByEvent[event.id] === "conflict").length;

  return {
    totalEvents: events.length,
    conflicts,
    // Per the dashboard's counting rule, only detected conflicts are excluded.
    // Unknown availability is not a guarantee of real-world availability.
    noConflicts: events.length - conflicts,
  };
}

export function calculateMyEventsSummary(
  events: readonly Pick<EventItem, "id" | "source">[],
  starredEventIds: readonly string[],
  manualEventIds: readonly string[],
  attendanceByEventId: Readonly<Record<string, AttendanceStatus>>,
): MyEventsSummary {
  const starredIds = new Set(starredEventIds);
  const manualIds = new Set(manualEventIds);
  const summary: MyEventsSummary = {
    totalEvents: 0,
    fromDiscover: 0,
    addedByMe: 0,
    attendance: {
      interested: 0,
      planning_to_attend: 0,
      registered: 0,
    },
  };

  for (const event of events) {
    const isManual = manualIds.has(event.id) || event.source === "Manual";
    if (!isManual && !starredIds.has(event.id)) continue;

    summary.totalEvents += 1;
    if (isManual) summary.addedByMe += 1;
    else summary.fromDiscover += 1;

    const status = attendanceByEventId[event.id] ?? "interested";
    summary.attendance[status] += 1;
  }

  return summary;
}
