import { getConfig } from '../server/config.mjs';
import { sessionIdentity } from '../server/auth.mjs';
import { openStorage } from '../server/storage.mjs';
import type { Runtime } from './runtime-types';

let instance: Runtime | undefined;
export function runtime(): Runtime {
  if (!instance) {
    const config = getConfig();
    instance = {
      ...openStorage(config.dataDir),
      SITE_ORIGIN: config.origin,
      localIdentity: (headers) => sessionIdentity(headers, config),
    };
  }
  return instance;
}
