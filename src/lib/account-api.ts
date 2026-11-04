import type { AttendanceStatus, BusyInterval, EventItem, ManualEventInput, Preferences } from "../types";
import type { LegacyRawValues } from "./legacy-storage";

export type AccountData = {
  preferences: Preferences | null;
  starredEvents: EventItem[];
  manualEvents: EventItem[];
  attendanceByEventId: Record<string, AttendanceStatus>;
  busyIntervals: BusyInterval[];
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/account${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Account data could not be saved.");
  return payload as T;
}

export const accountApi = {
  getData: () => request<AccountData>("/data"),
  migrateLocal: (rawValues: LegacyRawValues, eventSnapshots: EventItem[]) =>
    request("/migrate-local", {
      method: "POST",
      body: JSON.stringify({ rawValues, eventSnapshots }),
    }),
  setStarredEvent: (event: EventItem, starred: boolean) =>
    request("/stars", {
      method: "PUT",
      body: JSON.stringify({ event, starred }),
    }),
  updateAttendanceStatus: (eventId: string, status: AttendanceStatus) =>
    request("/stars/attendance", {
      method: "PUT",
      body: JSON.stringify({ eventId, status }),
    }),
  createManualEvent: async (input: ManualEventInput) =>
    (await request<{ event: EventItem }>("/manual-events", {
      method: "POST",
      body: JSON.stringify(input),
    })).event,
  updateManualEvent: async (eventId: string, input: ManualEventInput) =>
    (await request<{ event: EventItem }>(`/manual-events/${encodeURIComponent(eventId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    })).event,
  deleteManualEvent: (eventId: string) =>
    request(`/manual-events/${encodeURIComponent(eventId)}`, { method: "DELETE" }),
  updateManualEventAttendance: (eventId: string, status: AttendanceStatus) =>
    request(`/manual-events/${encodeURIComponent(eventId)}/attendance`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  savePreferences: (preferences: Preferences) =>
    request("/preferences", {
      method: "PUT",
      body: JSON.stringify(preferences),
    }),
  replaceBusyIntervals: (intervals: BusyInterval[]) =>
    request("/busy", {
      method: "PUT",
      body: JSON.stringify(intervals),
    }),
  clearBusyIntervals: () =>
    request("/busy", { method: "DELETE" }),
};
