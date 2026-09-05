import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  cpSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { hashPassword } from '../server/auth.mjs';
import { openDatabase } from '../server/storage.mjs';

const directory = mkdtempSync(join(tmpdir(), 'sparsity-deployment-'));
const reserve = createServer();
reserve.listen(0, '127.0.0.1');
await once(reserve, 'listening');
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const password = 'local-deployment-test-password';
const env = {
  ...process.env,
  DATA_DIR: join(directory, 'data'),
  SITE_ORIGIN: origin,
  SITE_ACCESS: 'public',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD_HASH: await hashPassword(password),
  SESSION_SECRET: 'a'.repeat(64),
  PORT: String(port),
  HOST: '127.0.0.1',
};
let child;
let logs = '';
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
  assert.equal(child.exitCode, 0, logs);
}
async function start() {
  logs = '';
  child = spawn(process.execPath, ['scripts/start-node.mjs'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (data) => {
    logs += data;
  });
  child.stderr.on('data', (data) => {
    logs += data;
  });
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(origin + '/healthz')).status === 200) return;
    } catch {
      /* Waiting for listen. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready: ${logs}`);
}
function records() {
  const db = openDatabase(env.DATA_DIR);
  const result = JSON.stringify({
    articles: db.prepare('SELECT * FROM articles ORDER BY id').all(),
    media: db.prepare('SELECT * FROM media ORDER BY id').all(),
  });
  db.close();
  return result;
}
try {
  execFileSync(process.execPath, ['scripts/migrate-node.mjs'], {
    env,
    stdio: 'pipe',
  });
  await start();
  execFileSync(process.execPath, ['scripts/smoke-node.mjs'], {
    env,
    stdio: 'pipe',
  });
  const request = (path, options = {}) =>
    fetch(origin + path, { redirect: 'manual', ...options });
  assert.equal(
    (
      await request('/api/admin/articles', {
        headers: {
          'oai-authenticated-user-id': 'local_seedy',
          'oai-authenticated-user-email': 'seedy@sites.test',
          Cookie: '__sites_local_auth=1',
        },
      })
    ).status,
    401,
  );
  const login = (loginOrigin = origin) =>
    request('/auth/login', {
      method: 'POST',
      headers: { Origin: loginOrigin },
      body: new URLSearchParams({
        username: 'admin',
        password,
        return_to: '//evil.example',
      }),
    });
  assert.equal((await login('https://evil.example')).status, 403);
  const response = await login();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/admin');
  const cookie = response.headers.get('set-cookie').split(';')[0];
  execFileSync(process.execPath, ['scripts/verify-runtime.mjs'], {
    env: { ...env, SITE_TEST_ORIGIN: origin, SITE_TEST_COOKIE: cookie },
    stdio: 'inherit',
  });
  const before = records();
  const mediaFile = readdirSync(join(env.DATA_DIR, 'media'))[0];
  const bytes = readFileSync(join(env.DATA_DIR, 'media', mediaFile));
  await stop();
  cpSync(env.DATA_DIR, join(directory, 'backup'), { recursive: true });
  execFileSync(process.execPath, ['scripts/migrate-node.mjs'], {
    env,
    stdio: 'pipe',
  });
  await start();
  assert.equal(
    records(),
    before,
    'Restart/migration must not reseed or overwrite edited articles.',
  );
  assert.deepEqual(readFileSync(join(env.DATA_DIR, 'media', mediaFile)), bytes);
  assert.equal(
    (await request(`/media/${mediaFile}`, { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  await stop();
  const db = openDatabase(env.DATA_DIR);
  db.exec("UPDATE articles SET title = 'temporary changed data'");
  db.close();
  rmSync(env.DATA_DIR, { recursive: true });
  cpSync(join(directory, 'backup'), env.DATA_DIR, { recursive: true });
  env.SITE_ACCESS = 'private';
  await start();
  assert.equal(
    (await request('/')).status,
    307,
    'Private site must gate all readers.',
  );
  assert.equal((await request('/api/admin/articles')).status, 401);
  assert.equal((await request(`/media/${mediaFile}`)).status, 404);
  assert.equal(
    (await request('/', { headers: { Cookie: cookie } })).status,
    200,
  );
  assert.equal(
    records(),
    before,
    'Restored snapshot must contain original data.',
  );
  const logout = await request('/auth/logout', {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie },
  });
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  console.log(
    'Verified Node authentication, public/private access, persistent articles/images, restart, idempotent migration and backup restoration.',
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await stop();
  rmSync(directory, { recursive: true, force: true });
}
