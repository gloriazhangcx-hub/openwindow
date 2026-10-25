import type { Availability, BusyInterval, EventItem } from "../types";

export function intervalsOverlap(
  eventStart: string,
  eventEnd: string,
  busyStart: string,
  busyEnd: string,
): boolean {
  const start = Date.parse(eventStart);
  const end = Date.parse(eventEnd);
  const busyStartTime = Date.parse(busyStart);
  const busyEndTime = Date.parse(busyEnd);

  if (![start, end, busyStartTime, busyEndTime].every(Number.isFinite)) return false;
  if (end <= start || busyEndTime <= busyStartTime) return false;
  return start < busyEndTime && end > busyStartTime;
}

export function getAvailability(
  event: Pick<EventItem, "start" | "end">,
  busyIntervals: BusyInterval[] | null,
): Availability {
  if (!busyIntervals) return "unknown";
  if (!event.start || !event.end || !Number.isFinite(Date.parse(event.start)) || !Number.isFinite(Date.parse(event.end))) {
    return "unknown";
  }
  if (Date.parse(event.end) <= Date.parse(event.start)) return "unknown";

  return busyIntervals.some((busy) =>
    intervalsOverlap(event.start, event.end, busy.start, busy.end),
  )
    ? "conflict"
    : "available";
}

