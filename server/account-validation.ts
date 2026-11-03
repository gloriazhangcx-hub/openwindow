import { DEFAULT_PREFERENCES } from "../src/data/events";
import {
  ATTENDANCE_STATUSES,
  FORMATS,
  TOPICS,
  type AttendanceStatus,
  type BusyInterval,
  type EventItem,
  type Format,
  type Preferences,
  type Topic,
} from "../src/types";

const maxRawValueLength = 512_000;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

function stringArray(value: unknown, allowed?: readonly string[], maxItems = 30, maxLength = 120): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  if (!value.every((item) =>
    typeof item === "string" &&
    item.trim().length > 0 &&
    item.length <= maxLength &&
    (!allowed || allowed.includes(item)),
  )) return null;
  return [...new Set(value.map((item) => (item as string).trim()))];
}

export function parsePreferences(value: unknown): Preferences | null {
  if (!isRecord(value)) return null;
  const keywords = stringArray(value.keywords, undefined, 30, 100);
  const cities = stringArray(value.cities, undefined, 30, 120);
  const topics = stringArray(value.topics, TOPICS, 20, 80);
  const formats = stringArray(value.formats, FORMATS, 20, 80);
  if (!keywords || !cities || !topics || !formats) return null;
  const dateHorizonDays = Number(value.dateHorizonDays);
  if (!Number.isInteger(dateHorizonDays) || dateHorizonDays < 1 || dateHorizonDays > 30) return null;
  return {
    keywords,
    cities,
    dateHorizonDays,
    topics: topics as Topic[],
    formats: formats as Format[],
  };
}

export function parseLegacyPreferences(raw: string | null): Preferences | null {
  if (!raw || raw.length > maxRawValueLength) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    return parsePreferences({ ...DEFAULT_PREFERENCES, ...parsed });
  } catch {
    return null;
  }
}

export function parseLegacySavedIds(raw: string | null): string[] {
  if (!raw || raw.length > maxRawValueLength) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length > 2_000) return [];
    if (!parsed.every((id) => typeof id === "string" && id.length > 0 && id.length <= 180)) return [];
    return [...new Set(parsed as string[])];
  } catch {
    return [];
  }
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function parseBusyIntervals(value: unknown): BusyInterval[] | null {
  const records = Array.isArray(value)
    ? value
    : isRecord(value) ? value.busy ?? value.busyIntervals : null;
  if (!Array.isArray(records) || records.length > 500) return null;
  const intervals: BusyInterval[] = [];
  for (const record of records) {
    if (!isRecord(record)) return null;
    const allowed = new Set(["start", "end", "timeZone", "sourceId"]);
    if (Object.keys(record).some((key) => !allowed.has(key))) return null;
    if (typeof record.start !== "string" || typeof record.end !== "string") return null;
    const start = Date.parse(record.start);
    const end = Date.parse(record.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    if (record.timeZone !== undefined && !validTimeZone(record.timeZone)) return null;
    if (record.sourceId !== undefined && (typeof record.sourceId !== "string" || record.sourceId.length > 80)) return null;
    intervals.push({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      ...(typeof record.timeZone === "string" ? { timeZone: record.timeZone } : {}),
      ...(typeof record.sourceId === "string" ? { sourceId: record.sourceId } : {}),
    });
  }
  return intervals;
}

export function parseLegacyBusyIntervals(raw: string | null): BusyInterval[] | null {
  if (!raw || raw.length > maxRawValueLength) return null;
  try {
    return parseBusyIntervals(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function parseEventItem(value: unknown): EventItem | null {
  if (!isRecord(value)) return null;
  const {
    id, title, description, start, end, timeZone, city, venue, topics, formats, source, lumaUrl,
  } = value;
  if (
    typeof id !== "string" || id.length < 1 || id.length > 180 ||
    typeof title !== "string" || title.length < 1 || title.length > 240 ||
    typeof description !== "string" || description.length > 8_000 ||
    typeof start !== "string" || typeof end !== "string" ||
    !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start) ||
    !validTimeZone(timeZone) ||
    typeof city !== "string" || city.length > 120 ||
    typeof venue !== "string" || venue.length > 240 ||
    (source !== "Demo" && source !== "Luma") ||
    typeof lumaUrl !== "string" || lumaUrl.length > 2_000
  ) return null;
  try {
    if (new URL(lumaUrl).protocol !== "https:") return null;
  } catch {
    return null;
  }
  const validTopics = stringArray(topics, TOPICS, 20, 80);
  const validFormats = stringArray(formats, FORMATS, 20, 80);
  if (!validTopics || !validFormats) return null;
  return {
    id,
    title,
    description,
    start: new Date(Date.parse(start)).toISOString(),
    end: new Date(Date.parse(end)).toISOString(),
    timeZone,
    city,
    venue,
    topics: validTopics as Topic[],
    formats: validFormats as Format[],
    source,
    lumaUrl,
  };
}

export function validRawValues(value: unknown): value is Record<"preferences" | "saved" | "busy", string | null> {
  if (!isRecord(value)) return false;
  const allowed = new Set(["preferences", "saved", "busy"]);
  return Object.keys(value).every((key) => allowed.has(key)) &&
    ["preferences", "saved", "busy"].every((key) =>
      value[key] === null || (typeof value[key] === "string" && value[key].length <= maxRawValueLength),
    );
}

export function isPreferences(value: unknown): value is Preferences {
  return Boolean(parsePreferences(value));
}

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && ATTENDANCE_STATUSES.includes(value as AttendanceStatus);
}
