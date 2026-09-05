import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

assert.ok(existsSync('dist/server/index.js'), 'Missing Worker entrypoint');
const entry = readFileSync('dist/server/index.js', 'utf8');
assert.match(entry, /export\s*\{/);
assert.match(entry, /default/);
const config = JSON.parse(readFileSync('dist/.openai/hosting.json', 'utf8'));
assert.equal(config.d1, 'DB');
assert.equal(config.r2, 'MEDIA');
assert.ok(!config.static, 'Server build must not publish a static export');
const migrations = readdirSync('dist/.openai/drizzle').filter((name) =>
  name.endsWith('.sql'),
);
assert.ok(migrations.length > 0, 'Missing database migration');
assert.ok(existsSync('dist/client/favicon.svg'));
const fonts = readdirSync('dist/client/_next/static/media').filter(
  (name) => name.endsWith('.woff2') || name.endsWith('.woff'),
);
assert.ok(fonts.length >= 102, 'Missing locally hosted fonts');
console.log(
  'Verified Worker, D1/R2 configuration, database migrations, site assets and fonts.',
);
