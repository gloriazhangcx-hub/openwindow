type EventTimeCandidate = {
  id: string;
  start: string;
};

export function findNearestUpcomingEvent<T extends EventTimeCandidate>(
  events: readonly T[],
  starredEventIds: readonly string[],
  now = Date.now(),
): T | undefined {
  const starredIds = new Set(starredEventIds);
  let nearest: T | undefined;
  let nearestStart = Number.POSITIVE_INFINITY;

  for (const event of events) {
    const start = Date.parse(event.start);
    if (!starredIds.has(event.id) || !Number.isFinite(start) || start <= now) continue;
    if (start < nearestStart) {
      nearest = event;
      nearestStart = start;
    }
  }

  return nearest;
}
