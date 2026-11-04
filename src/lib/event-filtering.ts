import type {
  AttendanceStatus,
  AttendanceStatusFilter,
  Availability,
  EventItem,
  Format,
  Preferences,
  Topic,
} from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AvailabilityFilter = "all" | Availability;

export interface EventFilterOptions {
  preferences: Preferences;
  availabilityByEvent: Record<string, Availability>;
  attendanceByEventId: Record<string, AttendanceStatus>;
  savedEventIds: string[];
  starredEventIds?: string[];
  starredOnly?: boolean;
  selectedTopics: Topic[];
  selectedFormats: Format[];
  availabilityFilter: AvailabilityFilter;
  attendanceStatusFilter: AttendanceStatusFilter;
  savedOnly: boolean;
  searchQuery?: string;
  now?: number;
}

function matchesSearch(event: EventItem, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = `${event.title} ${event.description}`.toLowerCase();
  return terms.every((term) => searchableText.includes(term));
}

export function filterEvents(events: EventItem[], options: EventFilterOptions): EventItem[] {
  const now = options.now ?? Date.now();
  return events.filter((event) => {
    const start = Date.parse(event.start);
    const isManual = event.source === "Manual";
    const isPersonalCollection = options.savedOnly || options.starredOnly === true;
    if (!isManual && !isPersonalCollection && (
      !Number.isFinite(start) ||
      start < now - 60 * 60 * 1000 ||
      start > now + options.preferences.dateHorizonDays * DAY_MS
    )) return false;
    const cityMatch = isManual || isPersonalCollection || options.preferences.cities.length === 0 ||
      options.preferences.cities.some((city) => event.city.toLowerCase().includes(city.toLowerCase()));
    if (!cityMatch) return false;
    if (!matchesSearch(event, options.searchQuery ?? "")) return false;
    if (options.selectedTopics.length && !options.selectedTopics.some((topic) => event.topics.includes(topic))) return false;
    if (options.selectedFormats.length && !options.selectedFormats.some((format) => event.formats.includes(format))) return false;
    if (options.availabilityFilter !== "all" && options.availabilityByEvent[event.id] !== options.availabilityFilter) return false;
    if (options.starredOnly && !(options.starredEventIds ?? []).includes(event.id)) return false;
    if (!options.starredOnly && options.savedOnly && !isManual && !options.savedEventIds.includes(event.id)) return false;
    if (
      options.savedOnly &&
      !options.starredOnly &&
      options.attendanceStatusFilter !== "all" &&
      (options.attendanceByEventId[event.id] ?? "interested") !== options.attendanceStatusFilter
    ) return false;
    return true;
  }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
