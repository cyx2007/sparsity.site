import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { bundleFiles, sourceRoot } from '../../scripts/release-utils.mjs';

export function sealBundle(bundle) {
  writeFileSync(
    join(bundle, 'SHA256SUMS'),
    bundleFiles
      .map(
        (file) =>
          `${createHash('sha256')
            .update(readFileSync(join(bundle, file)))
            .digest('hex')}  ${file}\n`,
      )
      .join(''),
  );
}

export function createBundle(bundle, platform = 'linux/amd64') {
  mkdirSync(bundle, { recursive: true });
  for (const file of bundleFiles.slice(2)) {
    mkdirSync(dirname(join(bundle, file)), { recursive: true });
    copyFileSync(join(sourceRoot, file), join(bundle, file));
  }
  writeFileSync(join(bundle, 'images.tar'), 'mock Docker archive');
  const arch = platform.split('/')[1];
  writeFileSync(
    join(bundle, 'release.env'),
    `FORMAT_VERSION=1\nRELEASE_ID=v1\nPLATFORM=${platform}\nAPP_IMAGE=sparsity:v1-${arch}\nPROXY_IMAGE=sparsity-caddy:v1-${arch}\n`,
  );
  sealBundle(bundle);
}
