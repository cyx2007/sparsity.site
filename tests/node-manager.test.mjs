import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createBundle, sealBundle } from './helpers/release-fixture.mjs';

await test(
  'Linux deployment manager restores failures, preserves rollback data, and checks backups',
  { skip: process.platform !== 'linux' || process.getuid() !== 0 },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), 'sparsity-manager-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'bin'));
    const bundle = join(root, 'bundle');
    createBundle(bundle);
    writeFileSync(
      join(root, 'config.env'),
      'SITE_ORIGIN=https://notes.example.com\n',
    );
    writeFileSync(
      join(root, 'bin/docker'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const root = process.env.SPARSITY_ROOT;
const args = process.argv.slice(2);
fs.appendFileSync(root + '/operations', (process.env.SPARSITY_RELEASE || '-') + ' ' + args.join(' ') + '\\n');
if (args[0] === 'version') console.log('linux/amd64');
if (args[0] === 'image' && args[1] === 'inspect') console.log('sha256:' + (args.at(-1).startsWith('sparsity-caddy:') ? 'b' : 'a').repeat(64) + ' linux/amd64');
if (args[0] === 'run' && args.includes('scripts/credentials.mjs')) console.log('SITE_ORIGIN=https://notes.example.com');
let fail = '';
try { fail = fs.readFileSync(root + '/fail-once', 'utf8'); } catch {}
const operation = args.includes('scripts/migrate-node.mjs') ? (args.includes('--check') ? 'check' : 'migrate') : args.includes('scripts/smoke-node.mjs') ? 'smoke' : '';
if (fail === process.env.SPARSITY_RELEASE + ':' + operation) {
  fs.unlinkSync(root + '/fail-once');
  if (operation !== 'check') fs.writeFileSync(root + '/data/marker', 'failed migration data');
  process.exit(17);
}
`,
      { mode: 0o755 },
    );
    const run = (...args) =>
      spawnSync('bash', [join(bundle, 'deploy/manage.sh'), ...args], {
        env: {
          ...process.env,
          SPARSITY_ROOT: root,
          PATH: `${root}/bin:${process.env.PATH}`,
        },
        encoding: 'utf8',
      });
    const success = (...args) => {
      const result = run(...args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return result;
    };
    const originalConfig = readFileSync(join(root, 'config.env'), 'utf8');
    assert.notEqual(
      run('init').status,
      0,
      'init must not reset existing credentials.',
    );
    assert.equal(
      readFileSync(join(root, 'config.env'), 'utf8'),
      originalConfig,
    );
    const images = readFileSync(join(bundle, 'images.tar'));
    writeFileSync(join(bundle, 'images.tar'), 'truncated image archive');
    assert.notEqual(run('deploy').status, 0);
    assert.ok(!existsSync(join(root, 'current')));
    assert.ok(
      !readFileSync(join(root, 'operations'), 'utf8').includes('image load'),
    );
    writeFileSync(join(bundle, 'images.tar'), images);
    // A valid checksum does not make a mismatched architecture deployable.
    createBundle(bundle, 'linux/arm64');
    assert.notEqual(run('deploy').status, 0);
    assert.ok(
      !readFileSync(join(root, 'operations'), 'utf8').includes('image load'),
    );
    createBundle(bundle);
    const manifest = readFileSync(join(bundle, 'release.env'), 'utf8');
    writeFileSync(
      join(bundle, 'release.env'),
      manifest.replace('RELEASE_ID=v1', `RELEASE_ID=$(touch ${root}/injected)`),
    );
    sealBundle(bundle);
    assert.notEqual(run('load').status, 0);
    assert.ok(
      !existsSync(join(root, 'injected')),
      'Manifest must never execute shell code.',
    );
    createBundle(bundle);
    rmSync(join(root, 'config.env'));
    success('init');
    success('deploy');
    assert.equal(
      readFileSync(join(root, 'releases/v1/image'), 'utf8').trim(),
      'sha256:' + 'a'.repeat(64),
    );
    assert.equal(
      readFileSync(join(root, 'releases/v1/proxy-image'), 'utf8').trim(),
      'sha256:' + 'b'.repeat(64),
    );
    assert.notEqual(
      run('deploy').status,
      0,
      'Existing releases must stay immutable.',
    );
    writeFileSync(join(root, 'data/marker'), 'original content');
    writeFileSync(join(root, 'fail-once'), 'v2:migrate');
    assert.notEqual(run('deploy', 'v2').status, 0);
    assert.equal(readlinkSync(join(root, 'current')), 'releases/v1');
    assert.equal(
      readFileSync(join(root, 'data/marker'), 'utf8'),
      'original content',
    );
    writeFileSync(join(root, 'fail-once'), 'v3:smoke');
    assert.notEqual(run('deploy', 'v3').status, 0);
    assert.equal(readlinkSync(join(root, 'current')), 'releases/v1');
    assert.equal(
      readFileSync(join(root, 'data/marker'), 'utf8'),
      'original content',
    );
    success('deploy', 'v4');
    writeFileSync(join(root, 'data/marker'), 'newly edited content');
    writeFileSync(join(root, 'fail-once'), 'v1:check');
    assert.notEqual(run('rollback', 'v1').status, 0);
    assert.equal(readlinkSync(join(root, 'current')), 'releases/v4');
    success('rollback', 'v1');
    assert.equal(
      readFileSync(join(root, 'data/marker'), 'utf8'),
      'newly edited content',
    );
    const backup = success('backup').stdout.match(/backup: (.+)/)[1];
    writeFileSync(join(root, 'data/marker'), 'after backup');
    assert.notEqual(
      run('restore', backup).status,
      0,
      'Data replacement must require the explicit flag.',
    );
    success('restore', backup, '--confirm-data-loss');
    assert.equal(
      readFileSync(join(root, 'data/marker'), 'utf8'),
      'newly edited content',
    );
    writeFileSync(join(backup, 'data.tar'), 'corrupted');
    assert.notEqual(run('restore', backup, '--confirm-data-loss').status, 0);
    assert.equal(
      readFileSync(join(root, 'data/marker'), 'utf8'),
      'newly edited content',
    );
    assert.ok(readdirSync(join(root, 'backups')).length >= 5);
    const operations = readFileSync(join(root, 'operations'), 'utf8').split(
      '\n',
    );
    assert.ok(
      !operations.some(
        (line) =>
          /\b(build|pull)\b/.test(line) && !line.includes('--pull=never'),
      ),
      'The host must neither build nor pull release images.',
    );
    for (const release of ['v2', 'v3'])
      assert.ok(
        !operations.some(
          (line) =>
            line.startsWith(release + ' ') &&
            line.includes('up -d --no-deps --force-recreate proxy'),
        ),
        'Failed releases must never reopen ingress.',
      );
  },
);
