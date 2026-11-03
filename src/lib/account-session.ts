export type ActiveAccountRef = { current: string | null };
export type AccountWriteStatus = "syncing" | "synced" | "error";

export function canHydrateLocalData(
  authLoaded: boolean,
  isSignedIn: boolean | undefined,
  userId: string | null,
  localOwnerId: string | null,
  migrationOwnerId: string | null,
): boolean {
  if (localOwnerId) return authLoaded && isSignedIn === true && localOwnerId === userId;
  if (migrationOwnerId) return authLoaded && isSignedIn === true && migrationOwnerId === userId;
  return true;
}

export function canImportLegacyForUser(
  userId: string,
  localOwnerId: string | null,
  migrationOwnerId: string | null,
): boolean {
  return (!localOwnerId || localOwnerId === userId) &&
    (!migrationOwnerId || migrationOwnerId === userId);
}

export function canExposeAccountData(
  authLoaded: boolean,
  isSignedIn: boolean | undefined,
  userId: string | null,
  loadedUserId: string | null,
  localOwnerId: string | null,
  migrationOwnerId: string | null,
): boolean {
  if (!authLoaded) return !localOwnerId && !migrationOwnerId;
  if (isSignedIn) return Boolean(userId && loadedUserId === userId);
  return !localOwnerId && !migrationOwnerId;
}

export function enqueueAccountWrite(
  currentQueue: Promise<void>,
  activeAccount: ActiveAccountRef,
  expectedUserId: string,
  operation: () => Promise<unknown>,
  updateStatus: (status: AccountWriteStatus) => void,
): Promise<void> {
  updateStatus("syncing");
  return currentQueue
    .then(async () => {
      if (activeAccount.current !== expectedUserId) return;
      await operation();
      if (activeAccount.current === expectedUserId) updateStatus("synced");
    })
    .catch(() => {
      if (activeAccount.current === expectedUserId) updateStatus("error");
    });
}
