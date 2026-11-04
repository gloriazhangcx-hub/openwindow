import type { EventItem } from "../types";

export type EventSortOrder = "soonest" | "latest";

export function sortEventsByStart(events: EventItem[], order: EventSortOrder = "soonest"): EventItem[] {
  const direction = order === "soonest" ? 1 : -1;
  return events
    .map((event, index) => ({ event, index, start: Date.parse(event.start) }))
    .sort((a, b) => {
      const aHasValidStart = Number.isFinite(a.start);
      const bHasValidStart = Number.isFinite(b.start);
      if (aHasValidStart !== bHasValidStart) return aHasValidStart ? -1 : 1;
      if (!aHasValidStart || a.start === b.start) return a.index - b.index;
      return (a.start - b.start) * direction;
    })
    .map(({ event }) => event);
}
