import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | null = null;
let database: Database | null = null;

export function getDatabase(): Database {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for private account storage.");
  }
  pool = new Pool({ connectionString });
  database = drizzle(pool, { schema });
  return database;
}

export function getPool(): Pool {
  if (!pool) getDatabase();
  if (!pool) throw new Error("PostgreSQL pool could not be initialized.");
  return pool;
}

export async function closeDatabase() {
  if (pool) await pool.end();
  pool = null;
  database = null;
}
