import type { BusyInterval, EventItem, Preferences } from "../types";
import type { LegacyRawValues } from "./legacy-storage";

export type AccountData = {
  preferences: Preferences | null;
  savedEventIds: string[];
  savedEvents: EventItem[];
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
  setSavedEvent: (event: EventItem, saved: boolean) =>
    request("/saved-events", {
      method: "PUT",
      body: JSON.stringify({ event, saved }),
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
