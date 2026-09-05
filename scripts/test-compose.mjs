import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  chmodSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { hashPassword } from '../server/auth.mjs';

const root = mkdtempSync(join(tmpdir(), 'sparsity-compose-'));
chmodSync(root, 0o755);
const image = process.env.SITE_TEST_IMAGE || 'sparsity:release';
const project = `sparsity-check-${process.pid}`;
const reserve = createServer();
reserve.listen(0, '127.0.0.1');
await once(reserve, 'listening');
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://localhost:${port}`;
const password = 'isolated-compose-test-password';
const runtimeFile = join(root, 'runtime.env');
writeFileSync(
  runtimeFile,
  `SITE_ORIGIN=${origin}\nSITE_ACCESS=public\nADMIN_USERNAME=admin\nADMIN_PASSWORD_HASH=${await hashPassword(password)}\nSESSION_SECRET=${'a'.repeat(64)}\n`,
  { mode: 0o600 },
);
mkdirSync(join(root, 'data'));
cpSync('deploy/compose.yaml', join(root, 'compose.yaml'));
cpSync('deploy/Caddyfile', join(root, 'Caddyfile'));
// Same proxy rules, isolated loopback port, local HTTP instead of real ACME.
writeFileSync(
  join(root, 'test.yaml'),
  `services:\n  proxy:\n    environment:\n      SITE_ORIGIN: http://localhost:8080\n    ports: !override\n      - "127.0.0.1:${port}:8080"\n`,
);
const imageId = execFileSync(
  'docker',
  ['image', 'inspect', '--format', '{{.Id}}', image],
  { encoding: 'utf8' },
).trim();
const env = {
  ...process.env,
  SPARSITY_ROOT: root,
  SPARSITY_RELEASE: 'integration-test',
  SPARSITY_IMAGE: imageId,
  SPARSITY_ENV_FILE: runtimeFile,
};
function compose(...args) {
  return execFileSync(
    'docker',
    [
      'compose',
      '--project-name',
      project,
      '--env-file',
      runtimeFile,
      '-f',
      join(root, 'compose.yaml'),
      '-f',
      join(root, 'test.yaml'),
      ...args,
    ],
    { env, stdio: 'pipe', encoding: 'utf8' },
  );
}
try {
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      '0',
      '-v',
      `${root}/data:/data`,
      image,
      'chown',
      '1000:1000',
      '/data',
    ],
    { stdio: 'pipe' },
  );
  compose('config', '--quiet');
  compose(
    'run',
    '--rm',
    '--no-deps',
    'app',
    'node',
    'scripts/migrate-node.mjs',
  );
  compose('up', '-d', '--wait', '--wait-timeout', '120');
  compose('exec', '-T', 'app', 'node', 'scripts/smoke-node.mjs');
  assert.equal(
    (await fetch(origin + '/healthz')).status,
    404,
    'Internal health must not be public.',
  );
  const login = await fetch(origin + '/auth/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: origin },
    body: new URLSearchParams({ username: 'admin', password }),
  });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  execFileSync(process.execPath, ['scripts/verify-runtime.mjs'], {
    env: { ...process.env, SITE_TEST_ORIGIN: origin, SITE_TEST_COOKIE: cookie },
    stdio: 'inherit',
  });
  compose('stop', 'proxy', 'app');
  compose(
    'run',
    '--rm',
    '--no-deps',
    'app',
    'node',
    'scripts/migrate-node.mjs',
    '--check',
  );
  compose('up', '-d', '--force-recreate', '--wait', '--wait-timeout', '120');
  const listing = await fetch(origin + '/api/admin/articles', {
    headers: { Cookie: cookie },
  });
  assert.equal(listing.status, 200);
  assert.ok(
    (await listing.json()).articles.some(
      (article) =>
        article.slug.startsWith('cms-check-') && article.status === 'archived',
    ),
  );
  console.log(
    'Verified production Compose, Caddy forwarding, non-root/read-only app, media writes and persistence after container recreation.',
  );
} catch (error) {
  console.error(compose('logs', '--tail', '50'));
  if (error.stderr) console.error(error.stderr.toString());
  throw error;
} finally {
  compose('down', '--remove-orphans');
  // Files created by containers can be owned by uid 1000 on Linux CI.
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      '0',
      '-v',
      `${root}:/verification`,
      image,
      'chown',
      '-R',
      `${process.getuid()}:${process.getgid()}`,
      '/verification',
    ],
    { stdio: 'pipe' },
  );
  rmSync(root, { recursive: true, force: true });
}
