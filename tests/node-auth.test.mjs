import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../server/config.mjs';
import {
  createLoginLimiter,
  hashPassword,
  safeReturnTo,
  sessionCookie,
  sessionIdentity,
  verifyPassword,
} from '../server/auth.mjs';

const password = 'test-only-password-123456';
const hash = await hashPassword(password);
const env = {
  SITE_ORIGIN: 'https://notes.example.com',
  DATA_DIR: '/tmp/test-data',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD_HASH: hash,
  SESSION_SECRET: 'a'.repeat(64),
};
await test('configuration fails closed; site is private by default', () => {
  assert.equal(readConfig(env).access, 'private');
  for (const SITE_ORIGIN of [
    'http://example.com',
    'https://example.com/path',
    'https://user:pass@example.com',
    'https://example.com?query',
  ])
    assert.throws(() => readConfig({ ...env, SITE_ORIGIN }));
  assert.throws(() => readConfig({ ...env, SESSION_SECRET: '' }));
  assert.throws(() => readConfig({ ...env, DATA_DIR: './data' }));
  assert.throws(() => readConfig({ ...env, ADMIN_PASSWORD_HASH: 'plaintext' }));
  assert.equal(
    readConfig({ ...env, SITE_ORIGIN: 'http://localhost:3000' }).secure,
    false,
  );
});
await test('password hashes authenticate only the right password', async () => {
  assert.ok(await verifyPassword(password, hash));
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword(null, hash), false);
});
await test('sessions reject expiry, tampering, duplicate cookies, rotated credentials and forged Sites headers', () => {
  const config = readConfig(env);
  const now = Date.now();
  const cookie = sessionCookie(config, now).split(';')[0];
  assert.match(
    sessionCookie(config),
    /__Host-sparsity_session=.*HttpOnly; SameSite=Strict;.*Secure/,
  );
  assert.equal(
    sessionIdentity(new Headers({ cookie }), config, now),
    'local:admin',
  );
  assert.equal(
    sessionIdentity(new Headers({ cookie }), config, now + 13 * 3600_000),
    null,
  );
  assert.equal(
    sessionIdentity(
      new Headers({
        cookie: cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a'),
      }),
      config,
      now,
    ),
    null,
  );
  assert.equal(
    sessionIdentity(
      new Headers({ cookie: `${cookie}; ${cookie}` }),
      config,
      now,
    ),
    null,
  );
  assert.equal(
    sessionIdentity(
      new Headers({ cookie }),
      { ...config, sessionSecret: 'b'.repeat(64) },
      now,
    ),
    null,
  );
  assert.equal(
    sessionIdentity(
      new Headers({ cookie }),
      { ...config, passwordHash: config.passwordHash + 'x' },
      now,
    ),
    null,
  );
  assert.equal(
    sessionIdentity(
      new Headers({ 'oai-authenticated-user-id': 'admin' }),
      config,
      now,
    ),
    null,
  );
});
await test('redirects remain in admin and login hashing has a bounded global budget', () => {
  for (const value of [
    'https://evil.example',
    '//evil.example',
    '/admin\\evil',
    '/admin\r\nLocation:evil',
    '/administrator',
  ])
    assert.equal(safeReturnTo(value), '/admin');
  assert.equal(safeReturnTo('/admin/articles/id'), '/admin/articles/id');
  let now = 1000;
  const allow = createLoginLimiter(() => now);
  for (let i = 0; i < 10; i++) assert.ok(allow());
  assert.equal(allow(), false);
  now += 300_000;
  assert.ok(allow());
});
