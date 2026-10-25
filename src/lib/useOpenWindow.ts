import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_PREFERENCES, demoBusyIntervals, mockEventSource } from "../data/events";
import { getAvailability } from "./calendar";
import type { BusyInterval, CalendarSyncStatus, EventItem, Preferences } from "../types";

const STORAGE_KEYS = {
  preferences: "openwindow.preferences.v1",
  saved: "openwindow.saved.v1",
  busy: "openwindow.busy.v1",
} as const;

type BusyOrigin = "Demo sample" | "Imported locally" | "Not synced";

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isBusyInterval(value: unknown): value is BusyInterval {
  if (!value || typeof value !== "object") return false;
  const interval = value as Record<string, unknown>;
  return (
    typeof interval.start === "string" &&
    typeof interval.end === "string" &&
    Number.isFinite(Date.parse(interval.start)) &&
    Number.isFinite(Date.parse(interval.end)) &&
    Date.parse(interval.end) > Date.parse(interval.start)
  );
}

function parseBusyImport(value: unknown): BusyInterval[] {
  let intervals: unknown;
  if (Array.isArray(value)) intervals = value;
  else if (value && typeof value === "object") {
    const payload = value as Record<string, unknown>;
    intervals = payload.busy ?? payload.busyIntervals;
  }
  if (!Array.isArray(intervals) || intervals.length > 500) {
    throw new Error("Choose a JSON file with a busy or busyIntervals array (up to 500 items).");
  }
  if (!intervals.every(isBusyInterval)) {
    throw new Error("Each calendar item must have a valid start and end time, with end after start.");
  }
  return intervals;
}

function readPreferences(): Preferences {
  const stored = readStored<Partial<Preferences>>(STORAGE_KEYS.preferences, {});
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    keywords: Array.isArray(stored.keywords) ? stored.keywords : DEFAULT_PREFERENCES.keywords,
    cities: Array.isArray(stored.cities) ? stored.cities : DEFAULT_PREFERENCES.cities,
    topics: Array.isArray(stored.topics) ? stored.topics : DEFAULT_PREFERENCES.topics,
    formats: Array.isArray(stored.formats) ? stored.formats : DEFAULT_PREFERENCES.formats,
    dateHorizonDays: Number.isFinite(stored.dateHorizonDays)
      ? Math.max(1, Math.min(30, Number(stored.dateHorizonDays)))
      : DEFAULT_PREFERENCES.dateHorizonDays,
  };
}

export interface OpenWindowModel {
  events: EventItem[];
  busyIntervals: BusyInterval[] | null;
  busyOrigin: BusyOrigin;
  savedEventIds: string[];
  preferences: Preferences;
  syncStatus: CalendarSyncStatus;
  availabilityByEvent: Record<string, ReturnType<typeof getAvailability>>;
  saveEvent: (eventId: string) => void;
  updatePreferences: (preferences: Preferences) => void;
  importBusyIntervals: (payload: unknown) => number;
  clearImportedBusyIntervals: () => void;
}

export function useOpenWindow(): OpenWindowModel {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [busyIntervals, setBusyIntervals] = useState<BusyInterval[] | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.busy);
    if (stored) {
      try {
        return parseBusyImport(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEYS.busy);
      }
    }
    return demoBusyIntervals;
  });
  const [busyOrigin, setBusyOrigin] = useState<BusyOrigin>(() =>
    localStorage.getItem(STORAGE_KEYS.busy) ? "Imported locally" : "Demo sample",
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.busy);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { lastSyncedAt?: string };
        if (parsed.lastSyncedAt && Number.isFinite(Date.parse(parsed.lastSyncedAt))) return parsed.lastSyncedAt;
      } catch {
        // A bare array payload has no timestamp, so use the time it was imported.
      }
      return new Date().toISOString();
    }
    return null;
  });
  const [savedEventIds, setSavedEventIds] = useState<string[]>(() =>
    readStored<string[]>(STORAGE_KEYS.saved, []),
  );
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);

  useEffect(() => {
    void mockEventSource.listEvents().then(setEvents);
  }, []);

  const syncStatus = useMemo<CalendarSyncStatus>(
    () => ({
      lastSyncedAt,
      sourceCount: busyIntervals ? new Set(busyIntervals.map((interval) => interval.sourceId).filter(Boolean)).size : 0,
      isStale: lastSyncedAt ? Date.now() - Date.parse(lastSyncedAt) > 24 * 60 * 60 * 1000 : false,
    }),
    [busyIntervals, lastSyncedAt],
  );

  const availabilityByEvent = useMemo(
    () =>
      Object.fromEntries(events.map((event) => [event.id, getAvailability(event, busyIntervals)])),
    [busyIntervals, events],
  );

  const saveEvent = useCallback((eventId: string) => {
    setSavedEventIds((previous) => {
      const next = previous.includes(eventId)
        ? previous.filter((id) => id !== eventId)
        : [...previous, eventId];
      localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(next));
      return next;
    });
  }, []);

  const updatePreferences = useCallback((nextPreferences: Preferences) => {
    const safePreferences = {
      ...nextPreferences,
      dateHorizonDays: Math.max(1, Math.min(30, nextPreferences.dateHorizonDays)),
    };
    setPreferences(safePreferences);
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(safePreferences));
  }, []);

  const importBusyIntervals = useCallback((payload: unknown) => {
    const imported = parseBusyImport(payload);
    setBusyIntervals(imported);
    setBusyOrigin("Imported locally");
    const syncedAt = new Date().toISOString();
    setLastSyncedAt(syncedAt);
    localStorage.setItem(
      STORAGE_KEYS.busy,
      JSON.stringify({ busy: imported, lastSyncedAt: syncedAt }),
    );
    return imported.length;
  }, []);

  const clearImportedBusyIntervals = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.busy);
    setBusyIntervals(demoBusyIntervals);
    setBusyOrigin("Demo sample");
    setLastSyncedAt(null);
  }, []);

  return {
    events,
    busyIntervals,
    busyOrigin,
    savedEventIds,
    preferences,
    syncStatus,
    availabilityByEvent,
    saveEvent,
    updatePreferences,
    importBusyIntervals,
    clearImportedBusyIntervals,
  };
}
