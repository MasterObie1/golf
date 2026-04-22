/**
 * Turso migration runner.
 *
 * Why this exists: Prisma's `migrate deploy` uses the classic migration engine
 * which speaks SQLite over the filesystem, not libSQL over the network, so it
 * cannot apply migrations against Turso. This script talks to Turso directly
 * via @libsql/client and applies pending migrations in order, tracking them in
 * a Prisma-compatible `_prisma_migrations` table.
 *
 * Bootstrap: on the first run against an existing database (tracking table
 * empty but the `League` table already exists), every migration on disk is
 * recorded as already applied. Future runs then apply only new migrations.
 *
 * Local dev (file: URLs) is skipped — use `prisma migrate dev` there.
 */

import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import crypto from "crypto";

async function main(): Promise<void> {
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    console.log("[migrate] No DATABASE_URL set — skipping");
    return;
  }

  if (url.startsWith("file:")) {
    console.log("[migrate] Local file URL — skipping (use `prisma migrate dev` locally)");
    return;
  }

  const client = createClient({ url, authToken });
  const migrationsDir = path.resolve(process.cwd(), "prisma/migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.log("[migrate] No prisma/migrations directory — nothing to apply");
    return;
  }

  // Prisma-compatible tracking table so this coexists with `prisma migrate` if
  // it ever becomes usable against Turso.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);

  const dirs = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const appliedResult = await client.execute(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
  );
  const appliedSet = new Set(appliedResult.rows.map((r) => String(r.migration_name)));

  // Bootstrap: if tracking is empty but the schema clearly exists, seed all
  // current migration names as applied rather than re-running them.
  if (appliedSet.size === 0) {
    const schemaCheck = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='League'`
    );
    if (schemaCheck.rows.length > 0) {
      console.log(`[migrate] Existing schema detected with empty tracking table — seeding ${dirs.length} migrations as applied`);
      for (const name of dirs) {
        const sqlPath = path.join(migrationsDir, name, "migration.sql");
        const checksum = fs.existsSync(sqlPath)
          ? crypto.createHash("sha256").update(fs.readFileSync(sqlPath)).digest("hex")
          : "seeded";
        await client.execute({
          sql: `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)`,
          args: [crypto.randomUUID(), checksum, name],
        });
      }
      console.log("[migrate] Bootstrap complete. Future runs will apply only new migrations.");
      return;
    }
  }

  const pending = dirs.filter((d) => !appliedSet.has(d));
  if (pending.length === 0) {
    console.log("[migrate] No pending migrations");
    return;
  }

  console.log(`[migrate] Applying ${pending.length} pending migration(s)`);
  for (const name of pending) {
    const sqlPath = path.join(migrationsDir, name, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      console.warn(`[migrate] ${name}: no migration.sql, skipping`);
      continue;
    }

    const sql = fs.readFileSync(sqlPath, "utf-8");
    console.log(`[migrate] Applying ${name}...`);
    await client.executeMultiple(sql);
    await client.execute({
      sql: `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)`,
      args: [
        crypto.randomUUID(),
        crypto.createHash("sha256").update(sql).digest("hex"),
        name,
      ],
    });
    console.log(`[migrate]   ✓ ${name}`);
  }
  console.log("[migrate] Done");
}

main().catch((e) => {
  console.error("[migrate] FAILED:", e);
  process.exit(1);
});
