export const STORAGE_KEYS = {
  preferences: "openwindow.preferences.v1",
  saved: "openwindow.saved.v1",
  busy: "openwindow.busy.v1",
} as const;

export const LEGACY_BACKUP_KEY = "openwindow.legacy-backup.v1";
export const LEGACY_MIGRATED_FOR_KEY = "openwindow.legacy-migrated-for.v1";
export const LOCAL_DATA_OWNER_KEY = "openwindow.local-data-owner.v1";

export type LegacyRawValues = {
  preferences: string | null;
  saved: string | null;
  busy: string | null;
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type LegacySnapshot = {
  rawValues: LegacyRawValues;
  backupPersisted: boolean;
};

type BackupEntry = {
  capturedAt: string;
  rawValues: LegacyRawValues;
};

function readRawValues(storage: StorageLike): LegacyRawValues {
  return {
    preferences: storage.getItem(STORAGE_KEYS.preferences),
    saved: storage.getItem(STORAGE_KEYS.saved),
    busy: storage.getItem(STORAGE_KEYS.busy),
  };
}

function parseBackup(raw: string | null): BackupEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; snapshots?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.snapshots)) return [];
    return parsed.snapshots.filter((entry): entry is BackupEntry => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Partial<BackupEntry>;
      if (typeof item.capturedAt !== "string" || !item.rawValues || typeof item.rawValues !== "object") return false;
      const values = item.rawValues as Partial<LegacyRawValues>;
      return ["preferences", "saved", "busy"].every((key) =>
        values[key as keyof LegacyRawValues] === null ||
        typeof values[key as keyof LegacyRawValues] === "string",
      );
    });
  } catch {
    return [];
  }
}

export function preserveLegacyStorage(storage: StorageLike): LegacySnapshot {
  const rawValues = readRawValues(storage);
  let backupPersisted = false;
  try {
    const existingRaw = storage.getItem(LEGACY_BACKUP_KEY);
    const snapshots = parseBackup(existingRaw);
    const serialized = JSON.stringify(rawValues);
    const alreadyStored = snapshots.some((entry) => JSON.stringify(entry.rawValues) === serialized);
    if (!alreadyStored) {
      snapshots.push({ capturedAt: new Date().toISOString(), rawValues });
      storage.setItem(LEGACY_BACKUP_KEY, JSON.stringify({ version: 1, snapshots }));
    }
    backupPersisted = true;
  } catch {
    // Keep the original keys untouched. The caller can still use this in-memory
    // snapshot and retry persistence on the next startup.
  }
  return { rawValues, backupPersisted };
}

export function captureLegacyStorageBeforeAppStart(): LegacySnapshot {
  return preserveLegacyStorage(window.localStorage);
}

export function getLegacyMigrationOwner(storage: StorageLike): string | null {
  return storage.getItem(LEGACY_MIGRATED_FOR_KEY);
}

export function getLocalDataOwner(storage: StorageLike): string | null {
  return storage.getItem(LOCAL_DATA_OWNER_KEY);
}
