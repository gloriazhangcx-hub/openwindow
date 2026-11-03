import { Pool } from "pg";
import { migrateLegacyStars } from "./legacy-star-migration";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to migrate legacy saved events.");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const migrated = await migrateLegacyStars(client);
    await client.query("COMMIT");
    console.log(`Legacy saves migrated: ${migrated}.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Could not migrate legacy saved events.", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
