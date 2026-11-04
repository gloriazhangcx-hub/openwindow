import type { PoolClient } from "pg";

export const SAVED_EVENTS_TO_STARS_MIGRATION_ID = "0002_saved_events_to_stars";

export type SavedEventsToStarsMigrationResult = {
  alreadyApplied: boolean;
  copied: number;
};

export async function ensureStarsAttendanceSchema(
  client: Pick<PoolClient, "query">,
): Promise<void> {
  await client.query(
    `ALTER TABLE stars
     ADD COLUMN IF NOT EXISTS attendance_status varchar(32) NOT NULL DEFAULT 'interested'`,
  );
  await client.query(
    `DO $migration$
     BEGIN
       ALTER TABLE stars
         ADD CONSTRAINT stars_attendance_status_check
         CHECK (attendance_status IN ('interested', 'planning_to_attend', 'registered'));
     EXCEPTION
       WHEN duplicate_object THEN NULL;
     END
     $migration$`,
  );
}

/**
 * Copies legacy saved-event memberships and attendance into the canonical
 * stars relation. Conflicting, different attendance values abort the
 * transaction so neither value is silently overwritten.
 */
export async function migrateSavedEventsToStars(
  client: Pick<PoolClient, "query">,
  migrationId = SAVED_EVENTS_TO_STARS_MIGRATION_ID,
  targetUserIds?: string[],
): Promise<SavedEventsToStarsMigrationResult> {
  await ensureStarsAttendanceSchema(client);

  const alreadyApplied = await client.query<{ id: string }>(
    "SELECT id FROM openwindow_schema_migrations WHERE id = $1 LIMIT 1",
    [migrationId],
  );
  if (alreadyApplied.rows.length) return { alreadyApplied: true, copied: 0 };

  const userScope = targetUserIds ? "AND saved.user_id = ANY($1::uuid[])" : "";
  const userParams = targetUserIds ? [targetUserIds] : [];
  const conflicts = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM saved_events AS saved
     INNER JOIN events AS event
       ON event.id = saved.event_id AND event.user_id = saved.user_id
     INNER JOIN stars AS starred
       ON starred.user_id = saved.user_id AND starred.event_id = saved.event_id
      WHERE starred.attendance_status <> saved.attendance_status
        ${userScope}`,
    userParams,
  );
  if ((conflicts.rows[0]?.count ?? 0) > 0) {
    throw new Error(
      `Cannot migrate saved events: ${conflicts.rows[0].count} existing Star relationship(s) have a different attendance status.`,
    );
  }

  const copied = await client.query<{ event_id: string }>(
    `INSERT INTO stars (user_id, event_id, created_at, attendance_status)
     SELECT saved.user_id, saved.event_id, saved.created_at, saved.attendance_status
     FROM saved_events AS saved
     INNER JOIN events AS event
       ON event.id = saved.event_id AND event.user_id = saved.user_id
      WHERE TRUE
        ${targetUserIds ? "AND saved.user_id = ANY($1::uuid[])" : ""}
     ON CONFLICT (user_id, event_id) DO NOTHING
      RETURNING event_id`,
    userParams,
  );
  await client.query(
    "INSERT INTO openwindow_schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING",
    [migrationId],
  );
  return { alreadyApplied: false, copied: copied.rowCount ?? 0 };
}
