import { createHash } from "node:crypto";
import type { EventItem, Format, Preferences, Topic } from "../src/types";

type JsonObject = Record<string, unknown>;

export type LumaSearchPlan = {
  query: string;
  location?: string;
};

const DEFAULT_TIME_ZONE = "America/Los_Angeles";
const EVENT_ARRAY_KEYS = ["events", "results", "entries", "items", "matches", "event_results"];
const START_KEYS = ["start_at", "start", "start_time", "starts_at", "event_start_at", "start_date"];
const END_KEYS = ["end_at", "end", "end_time", "ends_at", "event_end_at", "end_date"];

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function text(value: unknown, maxLength = 1000): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return undefined;
}

function parseJsonText(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function parseObjectField(value: unknown): JsonObject | null {
  if (typeof value === "string") return asObject(parseJsonText(value));
  return asObject(value);
}

function eventLike(value: JsonObject): boolean {
  const hasTitle = typeof value.name === "string" || typeof value.title === "string";
  return hasTitle && START_KEYS.some((key) => value[key] !== undefined);
}

function extractEventRecords(input: unknown): { recognized: boolean; records: JsonObject[] } {
  const records: JsonObject[] = [];
  const visited = new Set<object>();
  let recognized = false;

  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value === "string") {
      const parsed = parseJsonText(value);
      if (parsed !== undefined) visit(parsed, depth + 1);
      else if (/no events? (?:found|match|available)/i.test(value)) recognized = true;
      return;
    }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    const object = value as JsonObject;
    if (eventLike(object)) {
      recognized = true;
      records.push(object);
      return;
    }

    for (const key of EVENT_ARRAY_KEYS) {
      if (Array.isArray(object[key])) recognized = true;
      visit(object[key], depth + 1);
    }
    for (const key of ["structuredContent", "content", "data", "result", "event", "payload", "text"]) {
      visit(object[key], depth + 1);
    }
  };

  visit(input, 0);
  return { recognized, records };
}

function parseTimestamp(value: unknown): string | undefined {
  const timestamp = typeof value === "number"
    ? (value < 100_000_000_000 ? value * 1000 : value)
    : undefined;
  if (timestamp !== undefined && !Number.isFinite(timestamp)) return undefined;
  const date = timestamp !== undefined ? new Date(timestamp) : null;
  if (date && !Number.isFinite(date.getTime())) return undefined;
  const raw = date ? date.toISOString() : text(value, 100);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function validTimeZone(value: unknown): string {
  const candidate = text(value, 100);
  if (!candidate) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function labelValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    const object = asObject(item);
    const label = object && firstText(object.name, object.label, object.title);
    return label ? [label] : [];
  });
}

function classifyTopics(value: string): Topic[] {
  const rules: Array<[Topic, RegExp]> = [
    ["AI & Tech", /\b(ai|artificial intelligence|tech|technology|software|developer|machine learning|data|robotics|agent)\b/i],
    ["Consumer & Retail", /\b(consumer|retail|e-?commerce|commerce|shopping|brand)\b/i],
    ["Social Impact", /\b(social impact|nonprofit|climate|community|sustainability|public interest|civic)\b/i],
    ["Career & Industry", /\b(career|professional|industry|leadership|hiring|workforce)\b/i],
    ["Startups", /\b(startups?|founders?|venture|entrepreneur|fundrais|pitch)\b/i],
  ];
  return rules.filter(([, pattern]) => pattern.test(value)).map(([topic]) => topic);
}

function classifyFormats(value: string): Format[] {
  const rules: Array<[Format, RegExp]> = [
    ["Hackathon", /\bhackathon\b/i],
    ["Workshop", /\b(workshop|hands-on|bootcamp)\b/i],
    ["Speaker / Panel", /\b(speaker|panel|fireside|talk|keynote)\b/i],
    ["Demo", /\b(demo|showcase|product launch)\b/i],
    ["Networking", /\b(networking|mixer|meetup|social)\b/i],
    ["Conference", /\b(conference|summit|convention)\b/i],
  ];
  return rules.filter(([, pattern]) => pattern.test(value)).map(([format]) => format);
}

function safeLumaUrl(record: JsonObject): string {
  const direct = firstText(record.url, record.event_url, record.luma_url, record.registration_url);
  if (direct) {
    try {
      const parsed = new URL(direct);
      if (
        parsed.protocol === "https:" &&
        (parsed.hostname === "lu.ma" || parsed.hostname === "luma.com" || parsed.hostname.endsWith(".luma.com"))
      ) return parsed.toString();
    } catch {
      // Try a Luma slug below when the provider returned a non-URL value.
    }
  }
  const slug = firstText(record.slug, record.event_slug);
  return slug && /^[a-z0-9-]+$/i.test(slug)
    ? `https://lu.ma/${slug}`
    : "https://lu.ma";
}

function normalizeEvent(record: JsonObject, fallbackCity?: string): EventItem | null {
  const nestedEvent = asObject(record.event);
  const event = nestedEvent ? { ...record, ...nestedEvent } : record;
  const title = firstText(event.name, event.title);
  const start = parseTimestamp(START_KEYS.map((key) => event[key]).find((value) => value !== undefined));
  if (!title || !start) return null;

  const geo = parseObjectField(event.geo_address_json ?? event.geo_address);
  const location = asObject(event.location);
  const city = firstText(
    event.city,
    geo?.city,
    geo?.city_name,
    location?.city,
    fallbackCity,
  ) ?? "Location TBD";
  const venue = firstText(
    event.venue,
    event.venue_name,
    geo?.name,
    geo?.venue,
    geo?.address,
    location?.name,
    typeof event.location === "string" ? event.location : undefined,
  ) ?? (event.is_online === true ? "Online" : "Venue not listed");
  const endValue = END_KEYS.map((key) => event[key]).find((value) => value !== undefined);
  const end = parseTimestamp(endValue) ?? new Date(Date.parse(start) + 60 * 60 * 1000).toISOString();
  if (Date.parse(end) <= Date.parse(start)) return null;

  const description = firstText(event.description, event.description_md, event.summary, event.subtitle) ?? "";
  const labels = [
    ...labelValues(event.tags),
    ...labelValues(event.topics),
    ...labelValues(event.categories),
    ...labelValues(event.event_type),
    ...labelValues(event.format),
  ].join(" ");
  const searchable = `${title} ${description} ${labels}`;
  const rawId = firstText(event.event_id, event.id, event.slug, event.event_slug);
  const id = rawId
    ? `luma-${rawId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 110)}`
    : `luma-${createHash("sha256").update(`${title}|${start}`).digest("hex").slice(0, 24)}`;

  return {
    id,
    title: title.slice(0, 300),
    description: description.slice(0, 5000),
    start,
    end,
    timeZone: validTimeZone(event.timezone ?? event.time_zone ?? event.timeZone),
    city: city.slice(0, 200),
    venue: venue.slice(0, 300),
    topics: classifyTopics(`${labels} ${searchable}`),
    formats: classifyFormats(`${labels} ${searchable}`),
    source: "Luma",
    lumaUrl: safeLumaUrl(event),
  };
}

export function buildLumaSearchPlans(keywords: string[], cities: string[]): LumaSearchPlan[] {
  const queries = [...new Set(keywords.map((value) => value.trim()).filter(Boolean))].slice(0, 8);
  const locations = [...new Set(cities.map((value) => value.trim()).filter(Boolean))].slice(0, 4);
  const searchTerms = queries.length ? queries : ["public events"];
  const searchLocations: Array<string | undefined> = locations.length ? locations : ["Bay Area"];
  const plans: LumaSearchPlan[] = [];
  for (const location of searchLocations) {
    for (const query of searchTerms) {
      plans.push({ query, ...(location ? { location } : {}) });
      if (plans.length >= 12) return plans;
    }
  }
  return plans;
}

export function normalizeLumaSearchResult(input: unknown, fallbackCity?: string): EventItem[] {
  const extracted = extractEventRecords(input);
  if (!extracted.recognized) {
    throw new Error("Luma search returned an unsupported response shape.");
  }

  const unique = new Map<string, EventItem>();
  for (const record of extracted.records) {
    const event = normalizeEvent(record, fallbackCity);
    if (!event) continue;
    unique.set(event.id, event);
  }
  return [...unique.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function validateSearchPreferences(value: unknown): Pick<Preferences, "keywords" | "cities" | "dateHorizonDays"> {
  const input = asObject(value);
  if (!input) throw new Error("Search preferences must be a JSON object.");

  const parseStrings = (candidate: unknown, label: string): string[] => {
    if (candidate === undefined) return [];
    if (!Array.isArray(candidate) || candidate.length > 20) {
      throw new Error(`${label} must be a list of up to 20 values.`);
    }
    return candidate.map((item) => {
      if (typeof item !== "string" || item.trim().length > 120) {
        throw new Error(`${label} must contain text values up to 120 characters.`);
      }
      return item.trim();
    }).filter(Boolean);
  };

  const keywords = parseStrings(input.keywords, "Keywords");
  const cities = parseStrings(input.cities, "Cities");
  const horizon = Number(input.dateHorizonDays ?? 14);
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 30) {
    throw new Error("Look-ahead must be between 1 and 30 days.");
  }
  return { keywords, cities, dateHorizonDays: horizon };
}
