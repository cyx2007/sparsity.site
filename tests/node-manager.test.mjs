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
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

await test(
  'Linux deployment manager restores failures, preserves rollback data, and checks backups',
  { skip: process.platform !== 'linux' || process.getuid() !== 0 },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), 'sparsity-manager-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'bin'));
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
if (args[0] === 'image') console.log('sha256:' + 'a'.repeat(64));
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
      spawnSync('bash', [resolve('deploy/manage.sh'), ...args], {
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
    success('deploy', 'v1');
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
