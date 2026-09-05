import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(readFileSync('dist/node-manifest.json', 'utf8'));
assert.equal(manifest.target, 'node');
assert.ok(existsSync('dist/server/index.js'));
assert.equal(
  manifest.entrySha256,
  createHash('sha256')
    .update(readFileSync('dist/server/index.js'))
    .digest('hex'),
  'Mismatched Node build; rebuild before starting.',
);
assert.ok(existsSync('dist/client/favicon.svg'));
function verify(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) verify(path);
    else if (entry.name.endsWith('.js'))
      assert.ok(
        !readFileSync(path, 'utf8').includes('cloudflare:workers'),
        `Cloudflare dependency in ${path}`,
      );
  }
}
verify('dist/server');
console.log(
  'Verified Node entrypoint, manifest, assets and runtime isolation.',
);
