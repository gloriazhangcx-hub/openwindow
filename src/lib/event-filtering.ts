import type { Availability, EventItem, Format, Preferences, Topic } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AvailabilityFilter = "all" | Availability;

export interface EventFilterOptions {
  preferences: Preferences;
  availabilityByEvent: Record<string, Availability>;
  savedEventIds: string[];
  selectedTopics: Topic[];
  selectedFormats: Format[];
  availabilityFilter: AvailabilityFilter;
  savedOnly: boolean;
  now?: number;
}

export function filterEvents(events: EventItem[], options: EventFilterOptions): EventItem[] {
  const now = options.now ?? Date.now();
  return events.filter((event) => {
    const start = Date.parse(event.start);
    if (
      !Number.isFinite(start) ||
      start < now - 60 * 60 * 1000 ||
      start > now + options.preferences.dateHorizonDays * DAY_MS
    ) return false;
    const cityMatch = options.preferences.cities.length === 0 ||
      options.preferences.cities.some((city) => event.city.toLowerCase().includes(city.toLowerCase()));
    if (!cityMatch) return false;
    if (options.selectedTopics.length && !options.selectedTopics.some((topic) => event.topics.includes(topic))) return false;
    if (options.selectedFormats.length && !options.selectedFormats.some((format) => event.formats.includes(format))) return false;
    if (options.availabilityFilter !== "all" && options.availabilityByEvent[event.id] !== options.availabilityFilter) return false;
    if (options.savedOnly && !options.savedEventIds.includes(event.id)) return false;
    return true;
  }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
