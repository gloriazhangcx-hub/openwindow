import type { PoolClient } from "pg";

export const LEGACY_STAR_MIGRATION_ID = "0001_saved_events_separate_from_stars";

/**
 * Reclassifies legacy star rows as saves. The caller must run this inside a
 * transaction. In the previous app version, the Save action was the only
 * writer to stars, so these rows represented saved events rather than stars.
 */
export async function migrateLegacyStars(
  client: Pick<PoolClient, "query">,
  migrationId = LEGACY_STAR_MIGRATION_ID,
  targetUserIds?: string[],
): Promise<number> {
  const alreadyApplied = await client.query<{ id: string }>(
    "SELECT id FROM openwindow_schema_migrations WHERE id = $1 LIMIT 1",
    [migrationId],
  );
  if (alreadyApplied.rows.length) return 0;

  const userScope = targetUserIds ? "AND starred.user_id = ANY($1::uuid[])" : "";
  const userParams = targetUserIds ? [targetUserIds] : [];
  const conflicts = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM stars AS starred
     INNER JOIN saved_events AS saved
       ON saved.user_id = starred.user_id AND saved.event_id = starred.event_id
     INNER JOIN events AS event
       ON event.id = starred.event_id AND event.user_id = starred.user_id
     WHERE saved.attendance_status <> starred.attendance_status
       ${userScope}`,
    userParams,
  );
  if ((conflicts.rows[0]?.count ?? 0) > 0) {
    throw new Error(
      `Cannot migrate legacy Stars: ${conflicts.rows[0].count} existing relationship(s) have a different attendance status.`,
    );
  }

  const copied = await client.query<{ event_id: string }>(
    `INSERT INTO saved_events (user_id, event_id, created_at, attendance_status)
     SELECT saved.user_id, saved.event_id, saved.created_at, saved.attendance_status
     FROM stars AS saved
     INNER JOIN events AS event
       ON event.id = saved.event_id AND event.user_id = saved.user_id
      WHERE TRUE
        ${targetUserIds ? "AND saved.user_id = ANY($1::uuid[])" : ""}
     ON CONFLICT (user_id, event_id) DO NOTHING
      RETURNING event_id`,
    userParams,
  );
  await client.query(
    `DELETE FROM stars AS saved
     USING events AS event
      WHERE event.id = saved.event_id AND event.user_id = saved.user_id
        ${targetUserIds ? "AND saved.user_id = ANY($1::uuid[])" : ""}`,
    userParams,
  );
  await client.query(
    "INSERT INTO openwindow_schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING",
    [migrationId],
  );
  return copied.rowCount ?? 0;
}
