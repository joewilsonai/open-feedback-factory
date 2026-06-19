import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

export async function migrateDatabase(databaseUrl = process.env.DATABASE_URL): Promise<void> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const schemaPath = await firstReadablePath([
    resolve(moduleDir, "schema.sql"),
    resolve(moduleDir, "../src/schema.sql"),
    resolve(process.cwd(), "packages/db/src/schema.sql"),
  ]);
  const schema = await readFile(schemaPath, "utf8");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(schema);
  } finally {
    await pool.end();
  }
}

async function firstReadablePath(paths: string[]): Promise<string> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next build/runtime layout.
    }
  }

  throw new Error(`Unable to find schema.sql in: ${paths.join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrateDatabase();
  console.log("Open Feedback Factory database migrated");
}
