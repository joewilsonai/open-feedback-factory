import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

export async function migrateDatabase(databaseUrl = process.env.DATABASE_URL): Promise<void> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(schema);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrateDatabase();
  console.log("Open Feedback Factory database migrated");
}
