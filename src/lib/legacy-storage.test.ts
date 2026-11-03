import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LEGACY_BACKUP_KEY,
  STORAGE_KEYS,
  preserveLegacyStorage,
  type StorageLike,
} from "./legacy-storage";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("legacy capture keeps exact values for all original keys before migration", () => {
  const storage = new MemoryStorage();
  const initial = {
    preferences: '{"keywords":["AI"],"dateHorizonDays":14}',
    saved: '["evt-one","evt-two"]',
    busy: '{"broken":true',
  };
  storage.setItem(STORAGE_KEYS.preferences, initial.preferences);
  storage.setItem(STORAGE_KEYS.saved, initial.saved);
  storage.setItem(STORAGE_KEYS.busy, initial.busy);

  const snapshot = preserveLegacyStorage(storage);

  assert.deepEqual(snapshot.rawValues, initial);
  assert.equal(snapshot.backupPersisted, true);
  assert.equal(storage.getItem(STORAGE_KEYS.preferences), initial.preferences);
  assert.equal(storage.getItem(STORAGE_KEYS.saved), initial.saved);
  assert.equal(storage.getItem(STORAGE_KEYS.busy), initial.busy);
  const backup = JSON.parse(storage.getItem(LEGACY_BACKUP_KEY) ?? "null") as {
    version: number;
    snapshots: Array<{ rawValues: typeof initial }>;
  };
  assert.equal(backup.version, 1);
  assert.deepEqual(backup.snapshots[0].rawValues, initial);
});

test("legacy capture appends changed raw values without replacing the original snapshot", () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEYS.preferences, "original preferences");
  storage.setItem(STORAGE_KEYS.saved, "[]");
  storage.setItem(STORAGE_KEYS.busy, "original busy");
  preserveLegacyStorage(storage);

  storage.setItem(STORAGE_KEYS.saved, '["evt-new"]');
  const updated = preserveLegacyStorage(storage);
  const backup = JSON.parse(storage.getItem(LEGACY_BACKUP_KEY) ?? "null") as {
    snapshots: Array<{ rawValues: { saved: string | null } }>;
  };

  assert.equal(updated.rawValues.saved, '["evt-new"]');
  assert.equal(backup.snapshots.length, 2);
  assert.equal(backup.snapshots[0].rawValues.saved, "[]");
  assert.equal(backup.snapshots[1].rawValues.saved, '["evt-new"]');
});
