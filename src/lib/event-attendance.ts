import type { EventItem } from "../types";

export function shouldShowMyEventsAttendanceControl(
  event: Pick<EventItem, "id" | "source">,
  myEventsOnly: boolean,
  starredEventIds: readonly string[],
): boolean {
  return myEventsOnly && (event.source === "Manual" || starredEventIds.includes(event.id));
}
