import { env } from 'cloudflare:workers';

type Runtime = { DB: D1Database; MEDIA: R2Bucket; SITE_OWNER_EMAIL?: string };

export function runtime(): Runtime {
  return env as unknown as Runtime;
}
