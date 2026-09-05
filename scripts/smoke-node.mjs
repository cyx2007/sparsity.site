import assert from 'node:assert/strict';
import { get } from 'node:http';
import { getConfig } from '../server/config.mjs';
import { sessionCookie } from '../server/auth.mjs';
const config = getConfig();
const base = `http://127.0.0.1:${config.port}`;
const headers = {
  Host: new URL(config.origin).host,
  Cookie: sessionCookie(config).split(';')[0],
};
for (const path of [
  '/healthz',
  '/',
  '/about',
  '/admin',
  '/api/admin/articles',
  '/favicon.svg',
]) {
  // node:http preserves the explicit Host for an internal loopback probe.
  // Fetch implementations can replace Host with the loopback URL's authority.
  const response = await new Promise((resolve, reject) => {
    const request = get(base + path, { headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
      res.on('error', reject);
    });
    request.setTimeout(15_000, () =>
      request.destroy(new Error('Smoke request timed out')),
    );
    request.on('error', reject);
  });
  assert.equal(
    response.status,
    200,
    `${path} returned ${response.status}: ${response.body.slice(0, 200)}`,
  );
}
console.log('Node release smoke check passed.');
