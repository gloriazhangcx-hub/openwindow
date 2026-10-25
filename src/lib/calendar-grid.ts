export interface VisibleMinuteRange {
  startMinute: number;
  endMinute: number;
  visibleStartMinute: number;
  visibleEndMinute: number;
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
