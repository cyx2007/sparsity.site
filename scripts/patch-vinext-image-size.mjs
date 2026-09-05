import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Vinext bundles the vulnerable image-size 2.0.2 code starting in beta.6.
// Keep this patch until the upstream parser is fixed; see
// docs/dependency-security.md for the advisories and removal conditions.
const packageRoot = new URL('../node_modules/vinext/', import.meta.url);
const { version } = JSON.parse(
  readFileSync(new URL('package.json', packageRoot), 'utf8'),
);
assert.equal(
  version,
  '1.0.0-beta.9',
  'Review the bundled image-size security patch when upgrading Vinext.',
);
const path = new URL(
  'dist/deps/.pnpm/image-size@2.0.2/deps/image-size/dist/index.js',
  packageRoot,
);
const original = readFileSync(path, 'utf8');
const marker = '// sparsity: image-size parser bounds patched\n';
const hash = (source) => createHash('sha256').update(source).digest('hex');

const replacements = [
  [
    '\tif (input.length - offset < 4) return;',
    '\tif (input.length - offset < 8) return;',
  ],
  [
    '\tif (input.length - offset < boxSize) return;',
    '\tif (boxSize < 8 || input.length - offset < boxSize) return;',
  ],
  [
    '\t\tconst fileLength = readUInt32BE(input, FILE_LENGTH_OFFSET);',
    '\t\tconst fileLength = readUInt32BE(input, FILE_LENGTH_OFFSET);\n' +
      '\t\tif (fileLength < SIZE_HEADER2 || fileLength > inputLength) ' +
      'throw new TypeError("Invalid ICNS file length");',
  ],
  [
    '\t\t\tconst imageHeader = readImageHeader(input, imageOffset);',
    '\t\t\tif (fileLength - imageOffset < SIZE_HEADER2) ' +
      'throw new TypeError("Invalid ICNS entry header");\n' +
      '\t\t\tconst imageHeader = readImageHeader(input, imageOffset);\n' +
      '\t\t\tif (imageHeader[1] < SIZE_HEADER2 || ' +
      'imageHeader[1] > fileLength - imageOffset) ' +
      'throw new TypeError("Invalid ICNS entry length");',
  ],
];

// Verify the original bytes even on repeat installs. Never silently skip a
// changed bundle or an incomplete patch because a marker happens to exist.
let unpatched = original;
if (original.startsWith(marker)) {
  unpatched = original.slice(marker.length);
  for (const [before, after] of replacements) {
    assert.equal(unpatched.split(after).length, 2, 'Incomplete parser patch.');
    unpatched = unpatched.replace(after, before);
  }
}
assert.equal(
  hash(unpatched),
  '456ef3528be51418bebdd975aac4b6f4345610964166d1492220b35d686c8d15',
  'Unrecognized image-size bundle; review the security patch before installing.',
);
let patched = unpatched;
for (const [before, after] of replacements) {
  assert.equal(patched.split(before).length, 2, 'Parser patch target changed.');
  patched = patched.replace(before, after);
}
patched = marker + patched;
if (original !== patched) writeFileSync(path, patched);
console.log('Verified Vinext image-size ICNS, HEIF and JXL parser bounds.');
