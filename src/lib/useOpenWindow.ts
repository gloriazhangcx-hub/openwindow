import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { DEFAULT_PREFERENCES, demoBusyIntervals, mockEventSource } from "../data/events";
import { getAvailability } from "./calendar";
import { accountApi } from "./account-api";
import {
  canExposeAccountData,
  canHydrateLocalData,
  canImportLegacyForUser,
  enqueueAccountWrite,
} from "./account-session";
import {
  LEGACY_MIGRATED_FOR_KEY,
  LOCAL_DATA_OWNER_KEY,
  STORAGE_KEYS,
  getLegacyMigrationOwner,
  getLocalDataOwner,
  preserveLegacyStorage,
} from "./legacy-storage";
import type { AttendanceStatus, BusyInterval, CalendarSyncStatus, EventItem, ManualEventInput, Preferences } from "../types";

type BusyOrigin = "Demo sample" | "Imported locally" | "Not synced";
export type PersistenceStatus = "local" | "syncing" | "synced" | "error";

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

export function parseBusyImport(value: unknown): BusyInterval[] {
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

function readBusyState(): { intervals: BusyInterval[] | null; origin: BusyOrigin; lastSyncedAt: string | null } {
  const stored = localStorage.getItem(STORAGE_KEYS.busy);
  if (stored !== null) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      const intervals = parseBusyImport(parsed);
      const lastSyncedAt = parsed && typeof parsed === "object" && "lastSyncedAt" in parsed
        ? (parsed as { lastSyncedAt?: unknown }).lastSyncedAt
        : null;
      return {
        intervals,
        origin: "Imported locally",
        lastSyncedAt: typeof lastSyncedAt === "string" && Number.isFinite(Date.parse(lastSyncedAt))
          ? lastSyncedAt
          : new Date().toISOString(),
      };
    } catch {
      // Keep malformed raw data in place. The startup snapshot preserves it.
      return { intervals: demoBusyIntervals, origin: "Not synced", lastSyncedAt: null };
    }
  }
  return { intervals: demoBusyIntervals, origin: "Demo sample", lastSyncedAt: null };
}

function writeLegacyValue(key: string, value: string, isSignedIn: boolean | undefined, userId: string | null): boolean {
  const storage = window.localStorage;
  const localOwner = getLocalDataOwner(storage);
  const migrationOwner = getLegacyMigrationOwner(storage);
  if (!isSignedIn && (localOwner || migrationOwner)) return false;
  try {
    storage.setItem(key, value);
    if (isSignedIn && userId) storage.setItem(LOCAL_DATA_OWNER_KEY, userId);
    return true;
  } catch {
    return false;
  }
}

export interface OpenWindowModel {
  events: EventItem[];
  busyIntervals: BusyInterval[] | null;
  busyOrigin: BusyOrigin;
  savedEventIds: string[];
  manualEventIds: string[];
  attendanceByEventId: Record<string, AttendanceStatus>;
  preferences: Preferences;
  syncStatus: CalendarSyncStatus;
  persistenceStatus: PersistenceStatus;
  accountReady: boolean;
  isAuthenticated: boolean;
  availabilityByEvent: Record<string, ReturnType<typeof getAvailability>>;
  saveEvent: (event: EventItem) => void;
  updateAttendanceStatus: (eventId: string, status: AttendanceStatus) => void;
  createManualEvent: (input: ManualEventInput) => Promise<EventItem>;
  updateManualEvent: (eventId: string, input: ManualEventInput) => Promise<EventItem>;
  deleteManualEvent: (eventId: string) => Promise<void>;
  updatePreferences: (preferences: Preferences) => void;
  importBusyIntervals: (payload: unknown) => number;
  clearImportedBusyIntervals: () => void;
  retryAccountSync: () => void;
}

export function useOpenWindow(): OpenWindowModel {
  const { isLoaded: authLoaded, isSignedIn, userId } = useAuth();
  const activeUserRef = useRef<string | null>(null);
  activeUserRef.current = authLoaded && isSignedIn && userId ? userId : null;
  const initialLocalAllowed = canHydrateLocalData(
    authLoaded,
    isSignedIn,
    userId ?? null,
    getLocalDataOwner(window.localStorage),
    getLegacyMigrationOwner(window.localStorage),
  );
  const [events, setEvents] = useState<EventItem[]>([]);
  const initialBusy = useRef(readBusyState()).current;
  const [busyIntervals, setBusyIntervals] = useState<BusyInterval[] | null>(
    initialLocalAllowed ? initialBusy.intervals : demoBusyIntervals,
  );
  const [busyOrigin, setBusyOrigin] = useState<BusyOrigin>(
    initialLocalAllowed ? initialBusy.origin : "Demo sample",
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initialLocalAllowed ? initialBusy.lastSyncedAt : null,
  );
  const [savedEventIds, setSavedEventIds] = useState<string[]>(() =>
    initialLocalAllowed ? readStored<string[]>(STORAGE_KEYS.saved, []) : [],
  );
  const [attendanceByEventId, setAttendanceByEventId] = useState<Record<string, AttendanceStatus>>({});
  const [preferences, setPreferences] = useState<Preferences>(
    initialLocalAllowed ? readPreferences() : DEFAULT_PREFERENCES,
  );
  const [savedEventSnapshots, setSavedEventSnapshots] = useState<EventItem[]>([]);
  const [manualEventSnapshots, setManualEventSnapshots] = useState<EventItem[]>([]);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("local");
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const attemptedUserRef = useRef<string | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    void mockEventSource.listEvents().then(setEvents);
  }, []);

  useEffect(() => {
    if (!authLoaded) return;
    if (!isSignedIn || !userId) {
      attemptedUserRef.current = null;
      setLoadedUserId(null);
      setSavedEventSnapshots([]);
      setManualEventSnapshots([]);
      setAttendanceByEventId({});
      setPersistenceStatus("local");
      if (!canHydrateLocalData(
        true,
        false,
        null,
        getLocalDataOwner(window.localStorage),
        getLegacyMigrationOwner(window.localStorage),
      )) {
        setSavedEventIds([]);
        setPreferences(DEFAULT_PREFERENCES);
        setBusyIntervals(demoBusyIntervals);
        setBusyOrigin("Demo sample");
        setLastSyncedAt(null);
      } else {
        setSavedEventIds(readStored<string[]>(STORAGE_KEYS.saved, []));
        setPreferences(readPreferences());
        const localBusy = readBusyState();
        setBusyIntervals(localBusy.intervals);
        setBusyOrigin(localBusy.origin);
        setLastSyncedAt(localBusy.lastSyncedAt);
      }
      return;
    }
    if (!events.length || attemptedUserRef.current === userId) return;

    attemptedUserRef.current = userId;
    setPersistenceStatus("syncing");
    let cancelled = false;
    const localOwner = getLocalDataOwner(window.localStorage);
    const migrationOwner = getLegacyMigrationOwner(window.localStorage);
    const mayImportLegacy = canImportLegacyForUser(userId, localOwner, migrationOwner);
    const canUseThisUserLocalState = !localOwner || localOwner === userId;

    void (async () => {
      if (mayImportLegacy) {
        const snapshot = preserveLegacyStorage(window.localStorage);
        const rawSavedIds = (() => {
          try {
            const parsed = JSON.parse(snapshot.rawValues.saved ?? "[]") as unknown;
            return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === "string")) : new Set<string>();
          } catch {
            return new Set<string>();
          }
        })();
        const eventSnapshots = events.filter((event) => rawSavedIds.has(event.id));
        await accountApi.migrateLocal(snapshot.rawValues, eventSnapshots);
        if (!migrationOwner) window.localStorage.setItem(LEGACY_MIGRATED_FOR_KEY, userId);
      }

      const account = await accountApi.getData();
      if (cancelled) return;
      setSavedEventIds(account.savedEventIds);
      setSavedEventSnapshots(account.savedEvents);
      setManualEventSnapshots(account.manualEvents);
      setAttendanceByEventId(account.attendanceByEventId);
      setPreferences(account.preferences ?? (canUseThisUserLocalState ? readPreferences() : DEFAULT_PREFERENCES));
      setBusyIntervals(account.busyIntervals.length ? account.busyIntervals : demoBusyIntervals);
      setBusyOrigin(account.busyIntervals.length ? "Imported locally" : "Demo sample");
      setLastSyncedAt(account.busyIntervals.length ? new Date().toISOString() : null);
      if (!localOwner && mayImportLegacy) window.localStorage.setItem(LOCAL_DATA_OWNER_KEY, userId);
      setLoadedUserId(userId);
      setPersistenceStatus("synced");
    })().catch(() => {
      if (cancelled) return;
      attemptedUserRef.current = null;
      setPersistenceStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [authLoaded, isSignedIn, userId, events, retryCount]);

  const accountReady = canExposeAccountData(
    authLoaded,
    isSignedIn,
    userId ?? null,
    loadedUserId,
    getLocalDataOwner(window.localStorage),
    getLegacyMigrationOwner(window.localStorage),
  );
  const visibleSavedIds = accountReady ? savedEventIds : [];
  const visibleManualEvents = accountReady ? manualEventSnapshots : [];
  const visibleManualIds = visibleManualEvents.map((event) => event.id);
  const visibleAttendanceByEventId = accountReady ? attendanceByEventId : {};
  const visiblePreferences = accountReady ? preferences : DEFAULT_PREFERENCES;
  const visibleBusyIntervals = accountReady ? busyIntervals : demoBusyIntervals;
  const visibleSavedSnapshots = accountReady ? savedEventSnapshots : [];
  const displayEvents = useMemo(() => {
    const byId = new Map(events.map((event) => [event.id, event]));
    visibleSavedSnapshots.forEach((event) => {
      if (!byId.has(event.id)) byId.set(event.id, event);
    });
    visibleManualEvents.forEach((event) => byId.set(event.id, event));
    return [...byId.values()];
  }, [events, visibleSavedSnapshots, visibleManualEvents]);

  const syncWrite = useCallback((operation: () => Promise<unknown>) => {
    const expectedUserId = activeUserRef.current;
    if (!expectedUserId) return;
    writeQueue.current = enqueueAccountWrite(
      writeQueue.current,
      activeUserRef,
      expectedUserId,
      operation,
      setPersistenceStatus,
    );
  }, []);

  const runAccountOperation = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    const expectedUserId = activeUserRef.current;
    if (!expectedUserId || !isSignedIn || !accountReady) {
      throw new Error("Sign in and wait for your account to finish loading.");
    }
    const pending = writeQueue.current.then(async () => {
      if (activeUserRef.current !== expectedUserId) {
        throw new Error("Your signed-in account changed. Try again.");
      }
      setPersistenceStatus("syncing");
      try {
        const result = await operation();
        if (activeUserRef.current === expectedUserId) setPersistenceStatus("synced");
        return result;
      } catch (error) {
        if (activeUserRef.current === expectedUserId) setPersistenceStatus("error");
        throw error;
      }
    });
    writeQueue.current = pending.then(() => undefined, () => undefined);
    return pending;
  }, [accountReady, isSignedIn]);

  const saveEvent = useCallback((event: EventItem) => {
    if (event.source === "Manual") return;
    const wasSaved = visibleSavedIds.includes(event.id);
    const nextSaved = !wasSaved;
    const nextIds = nextSaved
      ? [...visibleSavedIds, event.id]
      : visibleSavedIds.filter((id) => id !== event.id);
    setSavedEventIds(nextIds);
    setSavedEventSnapshots((previous) => nextSaved
      ? [...previous.filter((item) => item.id !== event.id), event]
      : previous.filter((item) => item.id !== event.id));
    setAttendanceByEventId((previous) => {
      if (nextSaved) {
        return previous[event.id]
          ? previous
          : { ...previous, [event.id]: "interested" };
      }
      const { [event.id]: _removed, ...remaining } = previous;
      return remaining;
    });
    writeLegacyValue(STORAGE_KEYS.saved, JSON.stringify(nextIds), isSignedIn, userId ?? null);
    if (isSignedIn) syncWrite(() => accountApi.setSavedEvent(event, nextSaved));
  }, [visibleSavedIds, isSignedIn, userId, syncWrite]);

  const updateAttendanceStatus = useCallback((eventId: string, status: AttendanceStatus) => {
    const isManual = visibleManualIds.includes(eventId);
    if (!isSignedIn || !accountReady || (!visibleSavedIds.includes(eventId) && !isManual)) return;
    setAttendanceByEventId((previous) => ({ ...previous, [eventId]: status }));
    syncWrite(() => isManual
      ? accountApi.updateManualEventAttendance(eventId.slice("manual:".length), status)
      : accountApi.updateAttendanceStatus(eventId, status));
  }, [isSignedIn, accountReady, visibleSavedIds, visibleManualIds, syncWrite]);

  const createManualEvent = useCallback(async (input: ManualEventInput) => {
    const expectedUserId = activeUserRef.current;
    const event = await runAccountOperation(() => accountApi.createManualEvent(input));
    if (activeUserRef.current !== expectedUserId) {
      throw new Error("Your signed-in account changed. Sign in again to view this event.");
    }
    setManualEventSnapshots((previous) => [...previous.filter((item) => item.id !== event.id), event]);
    setAttendanceByEventId((previous) => ({ ...previous, [event.id]: "interested" }));
    return event;
  }, [runAccountOperation]);

  const updateManualEvent = useCallback(async (eventId: string, input: ManualEventInput) => {
    if (!visibleManualIds.includes(eventId)) throw new Error("Personal event was not found.");
    const expectedUserId = activeUserRef.current;
    const event = await runAccountOperation(() =>
      accountApi.updateManualEvent(eventId.slice("manual:".length), input),
    );
    if (activeUserRef.current !== expectedUserId) {
      throw new Error("Your signed-in account changed. Sign in again to view this event.");
    }
    setManualEventSnapshots((previous) => previous.map((item) => item.id === eventId ? event : item));
    return event;
  }, [runAccountOperation, visibleManualIds]);

  const deleteManualEvent = useCallback(async (eventId: string) => {
    if (!visibleManualIds.includes(eventId)) throw new Error("Personal event was not found.");
    const expectedUserId = activeUserRef.current;
    await runAccountOperation(() =>
      accountApi.deleteManualEvent(eventId.slice("manual:".length)),
    );
    if (activeUserRef.current !== expectedUserId) return;
    setManualEventSnapshots((previous) => previous.filter((item) => item.id !== eventId));
    setAttendanceByEventId((previous) => {
      const { [eventId]: _removed, ...remaining } = previous;
      return remaining;
    });
  }, [runAccountOperation, visibleManualIds]);

  const updatePreferences = useCallback((nextPreferences: Preferences) => {
    const safePreferences = {
      ...nextPreferences,
      dateHorizonDays: Math.max(1, Math.min(30, nextPreferences.dateHorizonDays)),
    };
    setPreferences(safePreferences);
    writeLegacyValue(STORAGE_KEYS.preferences, JSON.stringify(safePreferences), isSignedIn, userId ?? null);
    if (isSignedIn) syncWrite(() => accountApi.savePreferences(safePreferences));
  }, [isSignedIn, userId, syncWrite]);

  const importBusyIntervals = useCallback((payload: unknown) => {
    const imported = parseBusyImport(payload);
    setBusyIntervals(imported);
    setBusyOrigin("Imported locally");
    const syncedAt = new Date().toISOString();
    setLastSyncedAt(syncedAt);
    writeLegacyValue(
      STORAGE_KEYS.busy,
      JSON.stringify({ busy: imported, lastSyncedAt: syncedAt }),
      isSignedIn,
      userId ?? null,
    );
    if (isSignedIn) syncWrite(() => accountApi.replaceBusyIntervals(imported));
    return imported.length;
  }, [isSignedIn, userId, syncWrite]);

  const clearImportedBusyIntervals = useCallback(() => {
    preserveLegacyStorage(window.localStorage);
    if (!isSignedIn && (getLocalDataOwner(window.localStorage) || getLegacyMigrationOwner(window.localStorage))) {
      setBusyIntervals(demoBusyIntervals);
      setBusyOrigin("Demo sample");
      setLastSyncedAt(null);
      return;
    }
    window.localStorage.removeItem(STORAGE_KEYS.busy);
    setBusyIntervals(demoBusyIntervals);
    setBusyOrigin("Demo sample");
    setLastSyncedAt(null);
    if (isSignedIn) syncWrite(() => accountApi.clearBusyIntervals());
  }, [isSignedIn, syncWrite]);

  const syncStatus = useMemo<CalendarSyncStatus>(
    () => ({
      lastSyncedAt,
      sourceCount: visibleBusyIntervals ? new Set(visibleBusyIntervals.map((interval) => interval.sourceId).filter(Boolean)).size : 0,
      isStale: lastSyncedAt ? Date.now() - Date.parse(lastSyncedAt) > 24 * 60 * 60 * 1000 : false,
    }),
    [visibleBusyIntervals, lastSyncedAt],
  );

  const availabilityByEvent = useMemo(
    () => Object.fromEntries(displayEvents.map((event) => [event.id, getAvailability(event, visibleBusyIntervals)])),
    [displayEvents, visibleBusyIntervals],
  );

  return {
    events: displayEvents,
    busyIntervals: visibleBusyIntervals,
    busyOrigin: accountReady ? busyOrigin : "Demo sample",
    savedEventIds: visibleSavedIds,
    manualEventIds: visibleManualIds,
    attendanceByEventId: visibleAttendanceByEventId,
    preferences: visiblePreferences,
    syncStatus,
    persistenceStatus,
    accountReady,
    isAuthenticated: Boolean(isSignedIn),
    availabilityByEvent,
    saveEvent,
    updateAttendanceStatus,
    createManualEvent,
    updateManualEvent,
    deleteManualEvent,
    updatePreferences,
    importBusyIntervals,
    clearImportedBusyIntervals,
    retryAccountSync: () => {
      attemptedUserRef.current = null;
      setRetryCount((value) => value + 1);
    },
  };
}
