import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  bundleFiles,
  docker,
  inspectImage,
  sha256,
  sourceRoot,
} from './release-utils.mjs';

const archive = resolve(process.argv[2] || '');
const name = basename(archive, '.tar.gz');
assert.match(
  name,
  /^sparsity-[a-z0-9][a-z0-9._-]*-linux-(amd64|arm64)$/,
  'Usage: npm run test:release -- outputs/releases/sparsity-RELEASE-linux-ARCH.tar.gz',
);
assert.equal(
  readFileSync(`${archive}.sha256`, 'utf8'),
  `${await sha256(archive)}  ${basename(archive)}\n`,
  'Release archive checksum mismatch.',
);
const directory = mkdtempSync(join(tmpdir(), 'sparsity-release-'));
try {
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  const bundle = join(directory, name);
  const sums = [];
  for (const file of bundleFiles)
    sums.push(`${await sha256(join(bundle, file))}  ${file}\n`);
  assert.equal(readFileSync(join(bundle, 'SHA256SUMS'), 'utf8'), sums.join(''));
  const manifest = readFileSync(join(bundle, 'release.env'), 'utf8');
  const match = manifest.match(
    /^FORMAT_VERSION=1\nRELEASE_ID=([a-z0-9][a-z0-9._-]{0,79})\nPLATFORM=(linux\/(amd64|arm64))\nAPP_IMAGE=(\S+)\nPROXY_IMAGE=(\S+)\n$/,
  );
  assert.ok(match, 'Invalid release manifest.');
  const [, release, platform, arch, app, proxy] = match;
  assert.equal(app, `sparsity:${release}-${arch}`);
  assert.equal(proxy, `sparsity-caddy:${release}-${arch}`);
  assert.equal(
    docker('version', '--format', '{{.Server.Os}}/{{.Server.Arch}}'),
    platform,
    'Run the integration test on a matching Docker host.',
  );
  execFileSync(
    'docker',
    ['image', 'load', '--input', join(bundle, 'images.tar')],
    { stdio: 'inherit' },
  );
  const appId = inspectImage(app, platform);
  const proxyId = inspectImage(proxy, platform);
  execFileSync('npm', ['run', 'test:compose'], {
    cwd: sourceRoot,
    env: {
      ...process.env,
      SITE_TEST_BUNDLE: bundle,
      SITE_TEST_IMAGE: appId,
      SITE_TEST_PROXY_IMAGE: proxyId,
    },
    stdio: 'inherit',
  });
  console.log(
    `Verified release archive, Docker load, and bundled Compose: ${name}`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
