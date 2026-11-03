export const TOPICS = [
  "AI & Tech",
  "Consumer & Retail",
  "Social Impact",
  "Career & Industry",
  "Startups",
] as const;

export const FORMATS = [
  "Hackathon",
  "Workshop",
  "Speaker / Panel",
  "Demo",
  "Networking",
  "Conference",
] as const;

export type Topic = (typeof TOPICS)[number];
export type Format = (typeof FORMATS)[number];
export type Availability = "available" | "conflict" | "unknown";

export interface EventItem {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  timeZone: string;
  city: string;
  venue: string;
  topics: Topic[];
  formats: Format[];
  source: "Demo" | "Luma";
  lumaUrl: string;
}

export interface BusyInterval {
  start: string;
  end: string;
  timeZone?: string;
  sourceId?: string;
}

export interface Preferences {
  keywords: string[];
  cities: string[];
  dateHorizonDays: number;
  topics: Topic[];
  formats: Format[];
}

export interface CalendarSyncStatus {
  lastSyncedAt: string | null;
  sourceCount: number;
  isStale: boolean;
}

export interface EventSource {
  readonly kind: "mock" | "luma";
  readonly enabled: boolean;
  listEvents(preferences?: Preferences, signal?: AbortSignal): Promise<EventItem[]>;
}
