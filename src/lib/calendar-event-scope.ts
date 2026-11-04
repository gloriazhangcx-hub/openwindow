import type { EventItem } from "../types";
import { filterEvents, type EventFilterOptions } from "./event-filtering";

export type CalendarEventScope = "all" | "my-events";

export const DEFAULT_CALENDAR_EVENT_SCOPE: CalendarEventScope = "all";

type CalendarFilterOptions = Omit<
  EventFilterOptions,
  "myEventsOnly" | "attendanceStatusFilter"
>;

export function filterCalendarEvents(
  events: EventItem[],
  options: CalendarFilterOptions,
  scope: CalendarEventScope,
): EventItem[] {
  return filterEvents(events, {
    ...options,
    myEventsOnly: scope === "my-events",
    attendanceStatusFilter: "all",
  });
}
