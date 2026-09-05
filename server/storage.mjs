import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dataDir, 'sparsity.sqlite'));
  db.exec(
    'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL;',
  );
  return db;
}

class Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.db, this.sql, values);
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.values) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.values) };
  }
  execute() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
  async run() {
    return this.execute();
  }
}

const contentTypes = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
export function openStorage(dataDir) {
  const db = openDatabase(dataDir);
  const mediaDir = join(dataDir, 'media');
  mkdirSync(mediaDir, { recursive: true, mode: 0o700 });
  const mediaPath = (key) => {
    if (!/^[a-f0-9-]{36}\.(png|jpg|gif|webp)$/.test(key))
      throw new Error('Invalid media key');
    return join(mediaDir, key);
  };
  return {
    DB: {
      prepare: (sql) => new Statement(db, sql),
      async batch(statements) {
        db.exec('BEGIN IMMEDIATE');
        try {
          // No await inside the transaction: concurrent requests cannot interleave.
          const results = statements.map((statement) => {
            if (!(statement instanceof Statement) || statement.db !== db)
              throw new Error('Foreign statement');
            return statement.execute();
          });
          db.exec('COMMIT');
          return results;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
    MEDIA: {
      async put(key, bytes, options) {
        const destination = mediaPath(key);
        if (
          options.httpMetadata.contentType !==
          contentTypes[key.split('.').at(-1)]
        )
          throw new Error('Media type mismatch');
        const temporary = join(mediaDir, `.upload-${randomUUID()}`);
        const file = await open(temporary, 'wx', 0o600);
        try {
          await file.writeFile(bytes);
          await file.sync();
          await file.close();
          await rename(temporary, destination);
        } catch (error) {
          await file.close().catch(() => {});
          await unlink(temporary).catch(() => {});
          throw error;
        }
      },
      async get(key) {
        try {
          const body = await readFile(mediaPath(key));
          return {
            body,
            httpMetadata: { contentType: contentTypes[key.split('.').at(-1)] },
          };
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      },
      async delete(key) {
        await unlink(mediaPath(key)).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      },
    },
    close: () => db.close(),
  };
}
