import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const parser = new URL(
  '../node_modules/vinext/dist/deps/.pnpm/image-size@2.0.2/' +
    'deps/image-size/dist/index.js',
  import.meta.url,
);
const parseInChild = `
  import assert from 'node:assert/strict';
  const { imageSize } = await import(process.argv[1]);
  const input = Buffer.from(JSON.parse(process.argv[2]));
  const expected = JSON.parse(process.argv[3]);
  if (expected === null) {
    assert.throws(() => imageSize(input));
  } else {
    const { width, height } = imageSize(input);
    assert.deepEqual({ width, height }, expected);
  }
`;

function checkImage(
  input: Buffer,
  expected: { width: number; height: number } | null = null,
) {
  // A test-runner timeout cannot interrupt a synchronous parser loop.
  // Isolate it in a killable process with a bounded heap as well as a timeout.
  const result = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=64',
      '--input-type=module',
      '-e',
      parseInChild,
      parser.href,
      JSON.stringify(Array.from(input)),
      JSON.stringify(expected),
    ],
    { timeout: 2_000, killSignal: 'SIGKILL', encoding: 'utf8' },
  );
  assert.equal(
    result.status,
    0,
    `Image parser failed or hung: ${result.error ?? result.stderr}`,
  );
}

function box(name: string, payload: Buffer, size = payload.length + 8) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size);
  header.write(name, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function icns(entrySize = 8) {
  const image = Buffer.alloc(16);
  image.write('icns');
  image.writeUInt32BE(image.length, 4);
  image.write('icp4', 8);
  image.writeUInt32BE(entrySize, 12);
  return image;
}

function heif(entrySize = 20) {
  const dimensions = Buffer.alloc(12);
  dimensions.writeUInt32BE(64, 4);
  dimensions.writeUInt32BE(32, 8);
  return Buffer.concat([
    box('ftyp', Buffer.from('avif\0\0\0\0')),
    box(
      'meta',
      Buffer.concat([
        Buffer.alloc(4),
        box('iprp', box('ipco', box('ispe', dimensions, entrySize))),
      ]),
    ),
  ]);
}

function jxl(entrySize = 16) {
  return Buffer.concat([
    box('JXL ', Buffer.from([0x0d, 0x0a, 0x87, 0x0a])),
    box('ftyp', Buffer.from('jxl \0\0\0\0')),
    box('jxlp', Buffer.from([0x80, 0, 0, 0, 0xff, 0x0a, 0x01, 0]), entrySize),
  ]);
}

for (const [format, fixture] of Object.entries({
  ICNS: icns,
  HEIF: heif,
  JXL: jxl,
})) {
  await test(`${format} rejects zero, undersized and out-of-bounds entries without hanging`, () => {
    for (const size of [0, 1, 7, 0xffffffff]) checkImage(fixture(size));
  });
}

await test('patched image parser retains PNG, ICNS, HEIF and JXL dimensions', () => {
  checkImage(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==',
      'base64',
    ),
    { width: 1, height: 1 },
  );
  checkImage(icns(), { width: 16, height: 16 });
  checkImage(heif(), { width: 64, height: 32 });
  checkImage(jxl(), { width: 8, height: 8 });
});

await test('Drizzle loader esbuild does not expose source to unrelated origins', async () => {
  const require = createRequire(import.meta.url);
  const coreRequire = createRequire(require.resolve('@esbuild-kit/core-utils'));
  const esbuild = coreRequire('esbuild') as typeof import('esbuild');
  const directory = mkdtempSync(join(tmpdir(), 'sparsity-esbuild-'));
  const context = await esbuild.context({
    stdin: { contents: 'export const value: number = 42;', loader: 'ts' },
    outfile: join(directory, 'bundle.js'),
    write: false,
  });
  try {
    const { port } = await context.serve({
      host: '127.0.0.1',
      port: 0,
      servedir: directory,
    });
    const url = `http://127.0.0.1:${port}/bundle.js`;
    const local = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    assert.equal(local.status, 200);
    assert.match(await local.text(), /value = 42/);
    const crossOrigin = await fetch(url, {
      headers: { Origin: 'https://untrusted.example' },
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(crossOrigin.headers.get('access-control-allow-origin'), null);
    await crossOrigin.arrayBuffer();
  } finally {
    await context.dispose();
    await esbuild.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});
