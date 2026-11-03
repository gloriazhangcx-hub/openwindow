import {
  ATTENDANCE_STATUS_LABELS,
  type AttendanceStatus,
  type Availability,
  type BusyInterval,
  type EventItem,
} from "../types";

function dayKey(date: Date, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type CalendarEventBlock = {
  kind: "event";
  key: string;
  start: Date;
  end: Date;
  event: EventItem;
  zone: string;
  availability: Availability;
  attendanceStatus: AttendanceStatus | null;
};

export type CalendarBusyBlock = {
  kind: "busy";
  key: string;
  start: Date;
  end: Date;
  interval: BusyInterval;
  zone: string;
};

export type CalendarDayBlock = CalendarEventBlock | CalendarBusyBlock;

export function getCalendarAttendanceStatus(
  eventId: string,
  savedEventIds: string[],
  attendanceByEventId: Record<string, AttendanceStatus>,
): AttendanceStatus | null {
  if (!savedEventIds.includes(eventId)) return null;
  return attendanceByEventId[eventId] ?? "interested";
}

export function getCalendarEventAccessibleLabel(
  event: EventItem,
  availability: Availability,
  attendanceStatus: AttendanceStatus | null,
): string {
  const availabilityLabel: Record<Availability, string> = {
    available: "Available",
    conflict: "Conflict",
    unknown: "Unknown",
  };
  return [
    event.title,
    availabilityLabel[availability],
    attendanceStatus ? `Attendance status: ${ATTENDANCE_STATUS_LABELS[attendanceStatus]}` : null,
  ].filter(Boolean).join(", ");
}

export function getCalendarDayBlocks(
  day: Date,
  events: EventItem[],
  busyIntervals: BusyInterval[] | null,
  availabilityByEventId: Record<string, Availability>,
  savedEventIds: string[],
  attendanceByEventId: Record<string, AttendanceStatus>,
): CalendarDayBlock[] {
  const targetDay = dayKey(day);
  const eventBlocks: CalendarEventBlock[] = events
    .filter((event) => dayKey(new Date(event.start), event.timeZone) === targetDay)
    .map((event) => ({
      kind: "event",
      key: event.id,
      start: new Date(event.start),
      end: new Date(event.end),
      event,
      zone: event.timeZone,
      availability: availabilityByEventId[event.id] ?? "unknown",
      attendanceStatus: getCalendarAttendanceStatus(event.id, savedEventIds, attendanceByEventId),
    }));
  const busyBlocks: CalendarBusyBlock[] = (busyIntervals ?? [])
    .filter((interval) =>
      dayKey(new Date(interval.start), interval.timeZone) === dayKey(day, interval.timeZone),
    )
    .map((interval, index) => ({
      kind: "busy",
      key: `busy-${index}-${interval.start}`,
      start: new Date(interval.start),
      end: new Date(interval.end),
      interval,
      zone: interval.timeZone ?? "America/Los_Angeles",
    }));

  return [...eventBlocks, ...busyBlocks];
}

export function countCalendarBusyIntervalsForDay(
  day: Date,
  busyIntervals: BusyInterval[] | null,
): number {
  return (busyIntervals ?? []).filter((interval) =>
    dayKey(new Date(interval.start), interval.timeZone) === dayKey(day, interval.timeZone),
  ).length;
}
