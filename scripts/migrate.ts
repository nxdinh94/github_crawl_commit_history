import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createRequire } from "node:module";
import { getDb } from "../db";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");
loadEnvConfig(process.cwd());
migrate(getDb(), { migrationsFolder: "./drizzle" });
console.log("Local SQLite database is up to date.");
