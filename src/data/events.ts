import type { BusyInterval, EventItem, EventSource, Format, Preferences, Topic } from "../types";

const timeZone = "America/Los_Angeles";

function zonedDateTime(date: Date, hour: number, minute = 0): string {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => dateParts.find((item) => item.type === type)?.value ?? "";
  const localDate = `${part("year")}-${part("month")}-${part("day")}`;
  const target = `${localDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const guess = new Date(`${target}-08:00`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT-8";
  const offset = offsetPart.replace("GMT", "");
  const offsetHours = Number(offset.match(/[+-]\d+/)?.[0] ?? "-8");
  const offsetMinutes = Number(offset.match(/:(\d+)/)?.[1] ?? "0");
  const offsetMs = (offsetHours * 60 + Math.sign(offsetHours || -1) * offsetMinutes) * 60_000;
  return new Date(Date.parse(`${target}Z`) - offsetMs).toISOString();
}

function dayFromToday(daysFromNow: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

function makeEvent(
  id: string,
  title: string,
  description: string,
  daysFromNow: number,
  startHour: number,
  durationHours: number,
  city: string,
  venue: string,
  topics: Topic[],
  formats: Format[],
  _lumaSlug: string,
  startMinute = 0,
): EventItem {
  const day = dayFromToday(daysFromNow);
  const start = zonedDateTime(day, startHour, startMinute);
  const endInMinutes = startHour * 60 + startMinute + durationHours * 60;
  const endDay = dayFromToday(daysFromNow + Math.floor(endInMinutes / (24 * 60)));
  const endMinuteOfDay = endInMinutes % (24 * 60);
  const end = zonedDateTime(endDay, Math.floor(endMinuteOfDay / 60), endMinuteOfDay % 60);
  return {
    id,
    title,
    description,
    start,
    end,
    timeZone,
    city,
    venue,
    topics,
    formats,
    source: "Demo",
    lumaUrl: "https://lu.ma",
  };
}

export const demoEvents: EventItem[] = [
  makeEvent("evt-agent-builders", "Agent Builders Night: From Prototype to Product", "A practical evening for people building AI agents, with short demos and plenty of time to compare notes.", 1, 18, 2, "San Francisco", "The Commons, SoMa", ["AI & Tech", "Startups"], ["Demo", "Networking"], "agent-builders-night"),
  makeEvent("evt-climate-ai", "AI for Climate & Community", "A conversation about applying emerging technology to local climate resilience and community needs.", 2, 17, 1.5, "Berkeley", "Bakar BioEnginuity Hub", ["AI & Tech", "Social Impact"], ["Speaker / Panel", "Networking"], "ai-climate-community", 30),
  makeEvent("evt-consumer-lab", "The New Consumer: Product Research Lab", "Hands-on exercises for product teams exploring how AI is changing consumer expectations.", 3, 18, 2, "San Francisco", "Runway, Dogpatch", ["Consumer & Retail", "AI & Tech"], ["Workshop"], "new-consumer-lab"),
  makeEvent("evt-founder-fieldnotes", "Founder Fieldnotes: First 100 Customers", "Three early-stage founders share the experiments that helped them find their first repeat customers.", 4, 18, 1.5, "San Francisco", "The Battery", ["Startups", "Career & Industry"], ["Speaker / Panel", "Networking"], "founder-fieldnotes"),
  makeEvent("evt-weekend-hack", "Build for Good Weekend Hackathon", "A community hackathon focused on practical tools for nonprofits and public-interest teams.", 5, 9, 8, "Berkeley", "Berkeley SkyDeck", ["Social Impact", "AI & Tech"], ["Hackathon", "Workshop"], "build-for-good-weekend"),
  makeEvent("evt-retail-demo", "Retail Tech Demo Breakfast", "A quick tour of new tools for modern retail, followed by informal networking over breakfast.", 7, 8, 1.5, "San Francisco", "The New Farm, Mission", ["Consumer & Retail", "Startups"], ["Demo", "Networking"], "retail-tech-demo"),
  makeEvent("evt-product-people", "Product People: Designing with AI", "Product leaders discuss where AI features create genuine user value—and where they do not.", 8, 18, 2, "San Francisco", "The Midway", ["AI & Tech", "Career & Industry"], ["Speaker / Panel", "Networking"], "product-people-ai"),
  makeEvent("evt-impact-founders", "Social Impact Founders Meetup", "An open, low-key meetup for founders and operators working on mission-led products.", 10, 17, 2, "Berkeley", "Berkeley Public Library", ["Social Impact", "Startups"], ["Networking"], "impact-founders-meetup"),
  makeEvent("evt-ml-workshop", "Applied ML: A Hands-on Workshop", "A guided workshop on putting small, useful machine-learning features into production.", 12, 18, 2.5, "San Francisco", "GitHub HQ", ["AI & Tech", "Career & Industry"], ["Workshop"], "applied-ml-workshop"),
  makeEvent("evt-future-of-retail", "Future of Retail & Commerce Summit", "A half-day gathering on emerging consumer products, retail operations, and commerce infrastructure.", 14, 10, 4, "San Francisco", "Fort Mason", ["Consumer & Retail", "Career & Industry"], ["Conference", "Speaker / Panel"], "future-retail-commerce"),
];

export const demoBusyIntervals: BusyInterval[] = [
  { start: zonedDateTime(dayFromToday(1), 18, 30), end: zonedDateTime(dayFromToday(1), 19, 15), sourceId: "work-calendar" },
  { start: zonedDateTime(dayFromToday(3), 17, 30), end: zonedDateTime(dayFromToday(3), 19, 0), sourceId: "personal-calendar" },
  { start: zonedDateTime(dayFromToday(5), 10, 0), end: zonedDateTime(dayFromToday(5), 12, 0), sourceId: "work-calendar" },
  { start: zonedDateTime(dayFromToday(7), 8, 0), end: zonedDateTime(dayFromToday(7), 9, 0), sourceId: "personal-calendar" },
  { start: zonedDateTime(dayFromToday(10), 17, 30), end: zonedDateTime(dayFromToday(10), 18, 30), sourceId: "work-calendar" },
];

export const DEFAULT_PREFERENCES: Preferences = {
  keywords: ["AI agents", "AI applications", "consumer tech", "social impact", "hackathon"],
  cities: ["San Francisco", "Berkeley"],
  dateHorizonDays: 14,
  topics: [],
  formats: [],
};

export const mockEventSource: EventSource = {
  kind: "mock",
  enabled: true,
  async listEvents() {
    return demoEvents;
  },
};

export const lumaEventSource: EventSource = {
  kind: "luma",
  enabled: true,
  async listEvents(preferences = DEFAULT_PREFERENCES, signal) {
    const response = await fetch("/api/luma/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        keywords: preferences.keywords,
        cities: preferences.cities,
        dateHorizonDays: preferences.dateHorizonDays,
      }),
      signal,
    });
    const payload = await response.json().catch(() => null) as {
      error?: string;
      events?: unknown;
    } | null;
    if (!response.ok) {
      throw new Error(payload?.error || "Could not search Luma events.");
    }
    if (!Array.isArray(payload?.events) || !payload.events.every(isEventItem)) {
      throw new Error("Luma returned event data OpenWindow could not read.");
    }
    return payload.events;
  },
};

function isEventItem(value: unknown): value is EventItem {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    typeof event.title === "string" &&
    typeof event.description === "string" &&
    typeof event.start === "string" &&
    typeof event.end === "string" &&
    typeof event.timeZone === "string" &&
    typeof event.city === "string" &&
    typeof event.venue === "string" &&
    Array.isArray(event.topics) &&
    Array.isArray(event.formats) &&
    event.source === "Luma" &&
    typeof event.lumaUrl === "string"
  );
}
