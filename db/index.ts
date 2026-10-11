import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

function createDatabase() {
  const databasePath = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || "data/commit-watch.sqlite");
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const client = new Database(databasePath);
  client.pragma("journal_mode = WAL");
  client.pragma("busy_timeout = 5000");
  return drizzle({ client, schema });
}

const globalForDatabase = globalThis as typeof globalThis & {
  commitWatchDatabase?: ReturnType<typeof createDatabase>;
};

export function getDb() {
  globalForDatabase.commitWatchDatabase ??= createDatabase();
  return globalForDatabase.commitWatchDatabase;
}
