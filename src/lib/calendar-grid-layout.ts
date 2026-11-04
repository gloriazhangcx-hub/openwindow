export interface VisibleMinuteRange {
  startMinute: number;
  endMinute: number;
  visibleStartMinute: number;
  visibleEndMinute: number;
}

export interface CalendarDayBounds {
  start: Date;
  end: Date;
}

function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const targetWallTime = Date.UTC(year, month - 1, day);
  let candidate = targetWallTime;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const observedWallTime = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    );
    const adjustment = targetWallTime - observedWallTime;
    if (adjustment === 0) return new Date(candidate);
    candidate += adjustment;
  }

  return new Date(candidate);
}

export function getCalendarDayBounds(day: Date, timeZone: string): CalendarDayBounds {
  if (!Number.isFinite(day.getTime())) throw new RangeError("Calendar day must be a valid date.");
  const year = day.getFullYear();
  const month = day.getMonth() + 1;
  const date = day.getDate();
  const nextDay = new Date(year, month - 1, date + 1, 12);
  return {
    start: zonedMidnight(year, month, date, timeZone),
    end: zonedMidnight(
      nextDay.getFullYear(),
      nextDay.getMonth() + 1,
      nextDay.getDate(),
      timeZone,
    ),
  };
}

export function clipIntervalToCalendarDay(
  start: Date,
  end: Date,
  day: Date,
  timeZone: string,
): CalendarDayBounds | null {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
  const bounds = getCalendarDayBounds(day, timeZone);
  const clippedStart = start > bounds.start ? start : bounds.start;
  const clippedEnd = end < bounds.end ? end : bounds.end;
  return clippedEnd > clippedStart
    ? { start: clippedStart, end: clippedEnd }
    : null;
}

export function minuteInZone(date: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function getVisibleMinuteRange(
  start: Date,
  end: Date,
  timeZone: string,
  visibleStartHour: number,
  visibleEndHour: number,
): VisibleMinuteRange | null {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;

  const startMinute = minuteInZone(start, timeZone);
  const endMinute = startMinute + (end.getTime() - start.getTime()) / 60_000;
  const visibleStartMinute = Math.max(startMinute, visibleStartHour * 60);
  const visibleEndMinute = Math.min(endMinute, visibleEndHour * 60);

  if (visibleEndMinute <= visibleStartMinute) return null;
  return { startMinute, endMinute, visibleStartMinute, visibleEndMinute };
}
