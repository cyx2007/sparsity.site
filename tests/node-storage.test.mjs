import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  cpSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStorage, openDatabase } from '../server/storage.mjs';
import { migrate } from '../server/migrations.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'sparsity-storage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(resolve('drizzle'), join(root, 'drizzle'), { recursive: true });
  return { data: join(root, 'data'), migrations: join(root, 'drizzle') };
}
await test('migrations are idempotent and reject changed history and schema downgrade', (t) => {
  const { data, migrations } = fixture(t);
  assert.equal(migrate(data, migrations).length, 1);
  const db = openDatabase(data);
  db.prepare('INSERT INTO settings VALUES (?, ?)').run('retained', 'user data');
  db.close();
  assert.deepEqual(migrate(data, migrations), []);
  const file = join(migrations, '0000_tan_karnak.sql');
  writeFileSync(file, readFileSync(file, 'utf8') + '\n-- edited history');
  assert.throws(() => migrate(data, migrations), /history differs/);
  cpSync(resolve('drizzle'), migrations, { recursive: true });
  const journalFile = join(migrations, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalFile, 'utf8'));
  journal.entries.push({
    ...journal.entries[0],
    idx: 1,
    tag: '0001_extension',
  });
  writeFileSync(journalFile, JSON.stringify(journal));
  writeFileSync(
    join(migrations, '0001_extension.sql'),
    'CREATE TABLE extension (id TEXT PRIMARY KEY);',
  );
  assert.throws(() => migrate(data, migrations, true), /Pending/);
  assert.equal(migrate(data, migrations).length, 1);
  assert.throws(
    () => migrate(data, resolve('drizzle'), true),
    /history differs/,
  );
  const checked = openDatabase(data);
  assert.equal(
    checked.prepare("SELECT value FROM settings WHERE key = 'retained'").get()
      .value,
    'user data',
  );
  checked.close();
});
await test('a failed multi-migration upgrade rolls back schema and migration ledger', (t) => {
  const { data, migrations } = fixture(t);
  migrate(data, migrations);
  const journalFile = join(migrations, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalFile, 'utf8'));
  journal.entries.push(
    { idx: 1, tag: '0001_good' },
    { idx: 2, tag: '0002_bad' },
  );
  writeFileSync(journalFile, JSON.stringify(journal));
  writeFileSync(
    join(migrations, '0001_good.sql'),
    'CREATE TABLE should_rollback (id TEXT);',
  );
  writeFileSync(
    join(migrations, '0002_bad.sql'),
    'INSERT INTO does_not_exist VALUES (1);',
  );
  assert.throws(() => migrate(data, migrations), /does_not_exist/);
  const db = openDatabase(data);
  assert.equal(
    db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'should_rollback'")
      .get(),
    undefined,
  );
  assert.equal(
    db.prepare('SELECT count(*) AS count FROM _sparsity_migrations').get()
      .count,
    1,
  );
  db.close();
});
await test('SQL batches are atomic; records and media survive reopening storage', async (t) => {
  const { data, migrations } = fixture(t);
  migrate(data, migrations);
  let storage = openStorage(data);
  await assert.rejects(
    storage.DB.batch([
      storage.DB.prepare('INSERT INTO settings VALUES (?, ?)').bind(
        'atomic',
        'first',
      ),
      storage.DB.prepare('INSERT INTO settings VALUES (?, ?)').bind(
        'atomic',
        'conflict',
      ),
    ]),
    /UNIQUE/,
  );
  assert.equal(
    await storage.DB.prepare(
      "SELECT * FROM settings WHERE key = 'atomic'",
    ).first(),
    null,
  );
  await storage.DB.prepare('INSERT INTO settings VALUES (?, ?)')
    .bind('durable', 'saved')
    .run();
  const key = '00000000-0000-4000-8000-000000000000.png';
  await storage.MEDIA.put(key, Buffer.from('image bytes'), {
    httpMetadata: { contentType: 'image/png' },
  });
  await assert.rejects(storage.MEDIA.get('../settings'), /Invalid media key/);
  storage.close();
  storage = openStorage(data);
  assert.equal(
    (
      await storage.DB.prepare('SELECT value FROM settings WHERE key = ?')
        .bind('durable')
        .first()
    ).value,
    'saved',
  );
  assert.equal((await storage.MEDIA.get(key)).body.toString(), 'image bytes');
  storage.close();
});
