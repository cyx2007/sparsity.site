import { env } from 'cloudflare:workers';
import type { Runtime } from './runtime-types';

export function runtime(): Runtime {
  return env as unknown as Runtime;
}
