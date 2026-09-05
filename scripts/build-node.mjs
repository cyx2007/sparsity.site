import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
rmSync('dist', { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/vinext/dist/cli.js', 'build'], {
  env: { ...process.env, DEPLOY_TARGET: 'node' },
  stdio: 'inherit',
});
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const entrySha256 = createHash('sha256')
  .update(readFileSync('dist/server/index.js'))
  .digest('hex');
writeFileSync(
  'dist/node-manifest.json',
  JSON.stringify({ target: 'node', version, entrySha256 }) + '\n',
);
