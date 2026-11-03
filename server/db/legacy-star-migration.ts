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
): Promise<number> {
  const alreadyApplied = await client.query<{ id: string }>(
    "SELECT id FROM openwindow_schema_migrations WHERE id = $1 LIMIT 1",
    [migrationId],
  );
  if (alreadyApplied.rows.length) return 0;

  const copied = await client.query<{ event_id: string }>(
    `INSERT INTO saved_events (user_id, event_id, created_at)
     SELECT saved.user_id, saved.event_id, saved.created_at
     FROM stars AS saved
     INNER JOIN events AS event
       ON event.id = saved.event_id AND event.user_id = saved.user_id
     ON CONFLICT (user_id, event_id) DO NOTHING
     RETURNING event_id`,
  );
  await client.query(
    `DELETE FROM stars AS saved
     USING events AS event
     WHERE event.id = saved.event_id AND event.user_id = saved.user_id`,
  );
  await client.query(
    "INSERT INTO openwindow_schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING",
    [migrationId],
  );
  return copied.rowCount ?? 0;
}
