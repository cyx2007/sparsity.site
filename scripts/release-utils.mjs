import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
export const bundleFiles = [
  'release.env',
  'images.tar',
  'deploy/manage.sh',
  'deploy/compose.yaml',
  'deploy/Caddyfile',
  'docs/deploy-ubuntu-26.04.md',
];

export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function proxyImage() {
  const compose = readFileSync(
    new URL('../deploy/compose.yaml', import.meta.url),
    'utf8',
  );
  const reference = compose.match(
    /image: \$\{SPARSITY_PROXY_IMAGE:-([^}]+)\}/,
  )?.[1];
  if (!reference || !/^caddy:[\w.-]+@sha256:[a-f0-9]{64}$/.test(reference))
    throw new Error('Compose must specify a pinned Caddy image.');
  return reference;
}

export function docker(...args) {
  return execFileSync('docker', args, {
    cwd: sourceRoot,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  }).trim();
}

export function inspectImage(image, platform) {
  const [details] = JSON.parse(
    docker('image', 'inspect', '--platform', platform, image),
  );
  if (
    `${details.Os}/${details.Architecture}` !== platform ||
    !/^sha256:[a-f0-9]{64}$/.test(details.Id)
  )
    throw new Error(`Image ${image} does not match ${platform}.`);
  return details.Id;
}
