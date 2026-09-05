import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openDatabase } from './storage.mjs';

export function migrationFiles(directory) {
  const journal = JSON.parse(
    readFileSync(join(directory, 'meta/_journal.json'), 'utf8'),
  );
  const files = journal.entries.map((entry) => `${entry.tag}.sql`);
  if (
    new Set(files).size !== files.length ||
    files.some((file) => !/^\d{4}_[\w-]+\.sql$/.test(file))
  )
    throw new Error('Invalid migration journal');
  if (
    readdirSync(directory)
      .filter((file) => file.endsWith('.sql'))
      .some((file) => !files.includes(file))
  )
    throw new Error('Unregistered SQL migration');
  return files.map((name) => {
    const sql = readFileSync(join(directory, name), 'utf8');
    return {
      name,
      sql,
      sha256: createHash('sha256').update(sql).digest('hex'),
    };
  });
}

export function migrate(dataDir, directory, checkOnly = false) {
  const files = migrationFiles(directory);
  const db = openDatabase(dataDir);
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(
      'CREATE TABLE IF NOT EXISTS _sparsity_migrations (name TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    const applied = db
      .prepare('SELECT name, sha256 FROM _sparsity_migrations ORDER BY rowid')
      .all();
    // Exact prefix prevents silently starting older code against a newer schema.
    for (let i = 0; i < applied.length; i++) {
      if (
        applied[i].name !== files[i]?.name ||
        applied[i].sha256 !== files[i]?.sha256
      )
        throw new Error(
          'Migration history differs from this release. Use a compatible release or restore its backup; never edit applied migrations.',
        );
    }
    const pending = files.slice(applied.length);
    if (checkOnly && pending.length)
      throw new Error(
        'Pending database migrations; run the migration command before starting.',
      );
    for (const file of pending) {
      db.exec(file.sql);
      db.prepare('INSERT INTO _sparsity_migrations VALUES (?, ?, ?)').run(
        file.name,
        file.sha256,
        new Date().toISOString(),
      );
    }
    const integrity = db.prepare('PRAGMA quick_check').get();
    if (integrity.quick_check !== 'ok')
      throw new Error('SQLite integrity check failed');
    db.exec('COMMIT');
    return pending.map((file) => file.name);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* A malformed migration may end its transaction. */
    }
    throw error;
  } finally {
    db.close();
  }
}
