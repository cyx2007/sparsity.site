import { access, constants } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getConfig } from '../server/config.mjs';
import { migrate } from '../server/migrations.mjs';
import { openStorage } from '../server/storage.mjs';
import {
  clearSessionCookie,
  createLoginLimiter,
  loginPage,
  safeReturnTo,
  sessionCookie,
  sessionIdentity,
  verifyPassword,
} from '../server/auth.mjs';

const config = getConfig();
const manifest = JSON.parse(readFileSync('dist/node-manifest.json', 'utf8'));
if (
  manifest.target !== 'node' ||
  manifest.entrySha256 !==
    createHash('sha256')
      .update(readFileSync('dist/server/index.js'))
      .digest('hex')
)
  throw new Error('Run npm run build:node before starting.');
migrate(config.dataDir, resolve('drizzle'), true);
const storage = openStorage(config.dataDir);
await access(join(config.dataDir, 'media'), constants.R_OK | constants.W_OK);
// Only this process's fixed, validated origin reaches the framework.
process.env.VINEXT_TRUSTED_HOSTS = new URL(config.origin).host;
process.env.VINEXT_TRUST_PROXY = '1';
const { startProdServer } = await import('vinext/server/prod-server');
const { server } = await startProdServer({
  port: config.port,
  host: config.host,
  outDir: resolve('dist'),
});
const handlers = server.listeners('request');
server.removeAllListeners('request');
const allowLogin = createLoginLimiter();
let stopping = false;

function respond(res, status, body = '', headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}
function requestHeaders(req) {
  return new Headers(
    Object.entries(req.headers)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join('; ') : value,
      ]),
  );
}
async function handle(req, res) {
  const url = new URL(req.url, config.origin);
  if (url.pathname === '/healthz') {
    if (stopping) return respond(res, 503);
    await storage.DB.prepare('SELECT count(*) AS count FROM articles').first();
    await access(
      join(config.dataDir, 'media'),
      constants.R_OK | constants.W_OK,
    );
    return respond(
      res,
      200,
      JSON.stringify({
        status: 'ok',
        release: process.env.RELEASE_ID || manifest.version,
      }),
      { 'Content-Type': 'application/json' },
    );
  }
  if (req.headers.host !== new URL(config.origin).host)
    return respond(res, 400, 'Invalid host');
  // Do not trust caller-controlled Sites identity or forwarding headers.
  for (const name of Object.keys(req.headers)) {
    if (name.startsWith('oai-') || name.startsWith('x-forwarded-'))
      delete req.headers[name];
  }
  req.headers['x-forwarded-proto'] = new URL(config.origin).protocol.slice(
    0,
    -1,
  );
  req.headers['x-forwarded-host'] = new URL(config.origin).host;
  const headers = requestHeaders(req);
  if (url.pathname === '/auth/login') {
    const target = safeReturnTo(url.searchParams.get('return_to'));
    const htmlHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    };
    if (req.method === 'GET')
      return respond(res, 200, loginPage(target), htmlHeaders);
    if (req.method !== 'POST')
      return respond(res, 405, '', { Allow: 'GET, POST' });
    if (headers.get('origin') !== config.origin)
      return respond(res, 403, 'Invalid origin');
    if (
      !headers
        .get('content-type')
        ?.startsWith('application/x-www-form-urlencoded')
    )
      return respond(res, 415);
    if (!allowLogin())
      return respond(res, 429, '登录尝试过多，请五分钟后重试。', {
        'Retry-After': '300',
      });
    let length = 0;
    const chunks = [];
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 4096) return respond(res, 413);
      chunks.push(chunk);
    }
    const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const valid = await verifyPassword(
      form.get('password'),
      config.passwordHash,
    );
    if (!valid || form.get('username') !== config.username)
      return respond(
        res,
        401,
        loginPage(form.get('return_to'), true),
        htmlHeaders,
      );
    return respond(res, 303, '', {
      'Set-Cookie': sessionCookie(config),
      Location: safeReturnTo(form.get('return_to')),
    });
  }
  if (url.pathname === '/auth/logout') {
    if (req.method !== 'POST') return respond(res, 405, '', { Allow: 'POST' });
    if (headers.get('origin') !== config.origin) return respond(res, 403);
    return respond(res, 303, '', {
      'Set-Cookie': clearSessionCookie(config),
      Location: '/auth/login',
    });
  }
  if (config.access === 'private' && !sessionIdentity(headers, config)) {
    if (url.pathname.startsWith('/api/'))
      return respond(res, 401, '{"error":"请先登录。"}', {
        'Content-Type': 'application/json',
      });
    if (url.pathname.startsWith('/media/')) return respond(res, 404);
    return respond(res, 307, '', {
      Location: `/auth/login?return_to=${encodeURIComponent(safeReturnTo(url.pathname + url.search))}`,
    });
  }
  for (const handler of handlers) await handler.call(server, req, res);
}
server.on('request', (req, res) => {
  handle(req, res).catch((error) => {
    console.error('Request failed', error);
    if (!res.headersSent) respond(res, 500, 'Internal server error');
    else res.destroy();
  });
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopping = true;
    server.close(() => {
      storage.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 25_000).unref();
  });
