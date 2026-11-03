import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canExposeAccountData,
  canHydrateLocalData,
  canImportLegacyForUser,
  enqueueAccountWrite,
} from "./account-session";

test("account switching hides the prior account and its local data", () => {
  assert.equal(canExposeAccountData(true, true, "alice", "alice", "alice", "alice"), true);
  assert.equal(canExposeAccountData(true, true, "bob", "alice", "alice", "alice"), false);
  assert.equal(canExposeAccountData(true, false, null, "alice", "alice", "alice"), false);
  assert.equal(canExposeAccountData(true, true, "bob", "bob", "alice", "alice"), true);

  assert.equal(canHydrateLocalData(true, true, "alice", "alice", "alice"), true);
  assert.equal(canHydrateLocalData(true, true, "bob", "alice", "alice"), false);
  assert.equal(canHydrateLocalData(true, false, null, "alice", "alice"), false);
  assert.equal(canHydrateLocalData(false, undefined, null, null, null), true);
});

test("legacy migration data cannot be imported into a different account", () => {
  assert.equal(canImportLegacyForUser("alice", null, null), true);
  assert.equal(canImportLegacyForUser("alice", "alice", "alice"), true);
  assert.equal(canImportLegacyForUser("bob", "alice", "alice"), false);
  assert.equal(canImportLegacyForUser("alice", "bob", "alice"), false);
});

test("queued writes for an old account are skipped after switching sessions", async () => {
  const activeAccount = { current: "alice" as string | null };
  const calls: string[] = [];
  const statuses: string[] = [];
  let signalFirstStarted!: () => void;
  let releaseFirst!: () => void;
  const firstStarted = new Promise<void>((resolve) => { signalFirstStarted = resolve; });
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const firstWrite = enqueueAccountWrite(
    Promise.resolve(),
    activeAccount,
    "alice",
    async () => {
      calls.push("alice-in-flight");
      signalFirstStarted();
      await firstGate;
    },
    (status) => statuses.push(status),
  );
  await firstStarted;
  const queuedAliceWrite = enqueueAccountWrite(
    firstWrite,
    activeAccount,
    "alice",
    async () => { calls.push("alice-queued"); },
    (status) => statuses.push(status),
  );

  activeAccount.current = "bob";
  releaseFirst();
  await queuedAliceWrite;
  assert.deepEqual(calls, ["alice-in-flight"]);

  const bobWrite = enqueueAccountWrite(
    queuedAliceWrite,
    activeAccount,
    "bob",
    async () => { calls.push("bob"); },
    (status) => statuses.push(status),
  );
  await bobWrite;
  assert.deepEqual(calls, ["alice-in-flight", "bob"]);
  assert.equal(statuses.at(-1), "synced");
});
