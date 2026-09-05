import { resolve, isAbsolute } from 'node:path';
import { migrate } from '../server/migrations.mjs';
const dataDir = process.env.DATA_DIR;
if (!dataDir || !isAbsolute(dataDir)) throw new Error('Set absolute DATA_DIR.');
const names = migrate(
  dataDir,
  resolve('drizzle'),
  process.argv.includes('--check'),
);
console.log(
  names.length ? `Applied: ${names.join(', ')}` : 'Schema is current.',
);
