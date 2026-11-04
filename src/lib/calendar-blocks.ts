import {
  ATTENDANCE_STATUS_LABELS,
  type AttendanceStatus,
  type Availability,
  type BusyInterval,
  type EventItem,
} from "../types";
import { clipIntervalToCalendarDay } from "./calendar-grid";

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
  isManual = false,
): AttendanceStatus | null {
  if (!isManual && !savedEventIds.includes(eventId)) return null;
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
    event.source === "Manual" ? "Added by you" : null,
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
  const eventBlocks: CalendarEventBlock[] = events.flatMap((event) => {
    const zone = event.timeZone || "America/Los_Angeles";
    const visibleRange = clipIntervalToCalendarDay(
      new Date(event.start),
      new Date(event.end),
      day,
      zone,
    );
    return visibleRange ? [{
      kind: "event",
      key: event.id,
      start: visibleRange.start,
      end: visibleRange.end,
      event,
      zone,
      availability: availabilityByEventId[event.id] ?? "unknown",
      attendanceStatus: getCalendarAttendanceStatus(
        event.id,
        savedEventIds,
        attendanceByEventId,
        event.source === "Manual",
      ),
    }] : [];
  });
  const busyBlocks: CalendarBusyBlock[] = (busyIntervals ?? []).flatMap((interval, index) => {
    const zone = interval.timeZone ?? "America/Los_Angeles";
    const visibleRange = clipIntervalToCalendarDay(
      new Date(interval.start),
      new Date(interval.end),
      day,
      zone,
    );
    return visibleRange ? [{
      kind: "busy",
      key: `busy-${index}-${interval.start}`,
      start: visibleRange.start,
      end: visibleRange.end,
      interval,
      zone,
    }] : [];
  });

  return [...eventBlocks, ...busyBlocks];
}

export function countCalendarBusyIntervalsForDay(
  day: Date,
  busyIntervals: BusyInterval[] | null,
): number {
  return (busyIntervals ?? []).filter((interval) =>
    clipIntervalToCalendarDay(
      new Date(interval.start),
      new Date(interval.end),
      day,
      interval.timeZone ?? "America/Los_Angeles",
    ) !== null,
  ).length;
}
