import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleFiles, sourceRoot } from '../scripts/release-utils.mjs';

await test('release packaging selects one platform, includes both images, and only ships allowlisted files', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sparsity-pack-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  const output = join(root, 'output with spaces');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PACK_TEST_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'image' && args[1] === 'inspect') {
  console.log(JSON.stringify([{Id: 'sha256:' + 'a'.repeat(64), Os: 'linux', Architecture: process.env.PACK_TEST_ARCH || 'amd64'}]));
}
if (args[0] === 'image' && args[1] === 'save') {
  if (process.env.PACK_TEST_FAIL) process.exit(17);
  fs.writeFileSync(args[args.indexOf('--output') + 1], 'exported app and proxy layers');
}
`,
    { mode: 0o755 },
  );
  const log = join(root, 'docker.log');
  const run = (args, env = {}) =>
    spawnSync(
      process.execPath,
      [
        join(sourceRoot, 'scripts/package-release.mjs'),
        '--output',
        output,
        ...args,
      ],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          PACK_TEST_LOG: log,
          ...env,
        },
        encoding: 'utf8',
      },
    );
  assert.notEqual(run(['--release', '../bad']).status, 0);
  assert.notEqual(
    run(['--release', 'v1', '--platform', 'linux/386']).status,
    0,
  );
  assert.notEqual(
    run(['--release', 'wrong-arch'], { PACK_TEST_ARCH: 'arm64' }).status,
    0,
  );
  assert.notEqual(
    run(['--release', 'export-failure'], { PACK_TEST_FAIL: '1' }).status,
    0,
  );
  assert.deepEqual(
    readdirSync(output),
    [],
    'Failed exports must not leave a release archive.',
  );
  const result = run(['--release', 'v1', '--image', 'sparsity:tested']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const name = 'sparsity-v1-linux-amd64';
  const archive = join(output, `${name}.tar.gz`);
  assert.equal(
    readFileSync(`${archive}.sha256`, 'utf8').split(' ')[0],
    createHash('sha256').update(readFileSync(archive)).digest('hex'),
  );
  const extraction = join(root, 'extracted');
  mkdirSync(extraction);
  execFileSync('tar', ['-xzf', archive, '-C', extraction]);
  const bundle = join(extraction, name);
  const files = readdirSync(bundle, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(bundle.length + 1))
    .sort();
  assert.deepEqual(files, [...bundleFiles, 'SHA256SUMS'].sort());
  for (const line of readFileSync(join(bundle, 'SHA256SUMS'), 'utf8')
    .trim()
    .split('\n')) {
    const [digest, file] = line.split('  ');
    assert.equal(
      digest,
      createHash('sha256')
        .update(readFileSync(join(bundle, file)))
        .digest('hex'),
    );
  }
  const manifest = readFileSync(join(bundle, 'release.env'), 'utf8');
  assert.match(
    manifest,
    /APP_IMAGE=sparsity:v1-amd64\nPROXY_IMAGE=sparsity-caddy:v1-amd64/,
  );
  assert.notEqual(
    run(['--release', 'v1']).status,
    0,
    'Existing outputs must not be overwritten.',
  );
  const built = run(['--build', '--release', 'v2']);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const operations = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.ok(
    operations.some(
      (args) =>
        args[0] === 'buildx' &&
        args.includes('--load') &&
        args.includes('linux/amd64'),
    ),
  );
  assert.ok(
    operations.some(
      (args) =>
        args[0] === 'image' &&
        args[1] === 'save' &&
        args.includes('--platform') &&
        args.includes('sparsity:v1-amd64') &&
        args.includes('sparsity-caddy:v1-amd64'),
    ),
  );
});
