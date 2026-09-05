import { isAbsolute } from 'node:path';

export function readConfig(env = process.env) {
  const url = new URL(env.SITE_ORIGIN || 'http://localhost:3000');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (!loopback && url.protocol !== 'https:') ||
    !['https:', 'http:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error(
      'SITE_ORIGIN must be one HTTPS origin (HTTP is only allowed on loopback).',
    );
  if (!env.DATA_DIR || !isAbsolute(env.DATA_DIR))
    throw new Error('DATA_DIR must be an absolute, persistent directory.');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(env.ADMIN_USERNAME || ''))
    throw new Error(
      'Set ADMIN_USERNAME (letters, digits, underscore or hyphen).',
    );
  if (
    !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.ADMIN_PASSWORD_HASH || '')
  )
    throw new Error(
      'Generate ADMIN_PASSWORD_HASH with the credentials command.',
    );
  if (!/^[a-f0-9]{64}$/.test(env.SESSION_SECRET || ''))
    throw new Error('SESSION_SECRET must be 32 random bytes encoded as hex.');
  const access = env.SITE_ACCESS || 'private';
  if (!['private', 'public'].includes(access))
    throw new Error('SITE_ACCESS must be private or public.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT.');
  return {
    origin: url.origin,
    secure: url.protocol === 'https:',
    dataDir: env.DATA_DIR,
    username: env.ADMIN_USERNAME,
    passwordHash: env.ADMIN_PASSWORD_HASH,
    sessionSecret: env.SESSION_SECRET,
    access,
    port,
    host: env.HOST || '127.0.0.1',
  };
}

let config;
export function getConfig() {
  return (config ??= readConfig());
}
