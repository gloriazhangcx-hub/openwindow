export type CalendarMode = "day" | "week" | "month";

export function atCalendarNoon(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

export function startOfCalendarWeek(date: Date): Date {
  const start = atCalendarNoon(date);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function getCalendarViewDays(date: Date, mode: CalendarMode): Date[] {
  const anchor = atCalendarNoon(date);
  if (mode === "day") return [anchor];

  const start = mode === "week"
    ? startOfCalendarWeek(anchor)
    : startOfCalendarWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12));
  const count = mode === "week" ? 7 : 42;

  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function navigateCalendarDate(date: Date, mode: CalendarMode, amount: number): Date {
  const next = atCalendarNoon(date);
  if (mode === "day") next.setDate(next.getDate() + amount);
  else if (mode === "week") next.setDate(next.getDate() + amount * 7);
  else return new Date(next.getFullYear(), next.getMonth() + amount, 1, 12);
  return next;
}
