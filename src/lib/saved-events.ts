type EventTimeCandidate = {
  id: string;
  start: string;
};

export function findNearestUpcomingSavedEvent<T extends EventTimeCandidate>(
  events: readonly T[],
  savedEventIds: readonly string[],
  now = Date.now(),
): T | undefined {
  const savedIds = new Set(savedEventIds);
  let nearest: T | undefined;
  let nearestStart = Number.POSITIVE_INFINITY;

  for (const event of events) {
    const start = Date.parse(event.start);
    if (!savedIds.has(event.id) || !Number.isFinite(start) || start <= now) continue;
    if (start < nearestStart) {
      nearest = event;
      nearestStart = start;
    }
  }

  return nearest;
}
