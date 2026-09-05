import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  bundleFiles,
  docker,
  inspectImage,
  proxyImage,
  sha256,
  sourceRoot,
} from './release-utils.mjs';

async function main() {
  const { values } = parseArgs({
    options: {
      build: { type: 'boolean', default: false },
      release: { type: 'string' },
      platform: { type: 'string', default: 'linux/amd64' },
      image: { type: 'string', default: 'sparsity:release' },
      output: { type: 'string', default: 'outputs/releases' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'npm run release:build -- --release ID [--platform linux/amd64|linux/arm64] [--output DIR]\n' +
        'npm run release:pack -- --release ID [--platform PLATFORM] [--image PREBUILT_IMAGE] [--output DIR]',
    );
    return;
  }
  const release = values.release;
  if (
    !release ||
    !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(release) ||
    release.includes('..')
  )
    throw new Error(
      'Provide --release with a unique lowercase release ID (up to 80 characters).',
    );
  const platform = values.platform;
  if (!['linux/amd64', 'linux/arm64'].includes(platform))
    throw new Error('Use --platform linux/amd64 or linux/arm64.');
  if (!values.image || values.image.startsWith('-') || /\s/.test(values.image))
    throw new Error('Invalid --image reference.');

  const arch = platform.split('/')[1];
  const name = `sparsity-${release}-linux-${arch}`;
  const output = resolve(values.output);
  const archive = join(output, `${name}.tar.gz`);
  const checksum = `${archive}.sha256`;
  if (existsSync(archive) || existsSync(checksum))
    throw new Error(`Release output already exists: ${archive}`);
  mkdirSync(output, { recursive: true });
  const staging = mkdtempSync(join(output, '.pack-'));
  try {
    const bundle = join(staging, name);
    mkdirSync(bundle);
    const appTag = `sparsity:${release}-${arch}`;
    const proxyTag = `sparsity-caddy:${release}-${arch}`;
    if (values.build) {
      execFileSync(
        'docker',
        [
          'buildx',
          'build',
          '--pull',
          '--platform',
          platform,
          '--target',
          'final',
          '--provenance=false',
          '--load',
          '--tag',
          appTag,
          '.',
        ],
        { cwd: sourceRoot, stdio: 'inherit' },
      );
    } else {
      inspectImage(values.image, platform);
      docker('image', 'tag', values.image, appTag);
    }
    inspectImage(appTag, platform);
    // Caddy is part of the bundle, so a deployment never needs a registry.
    const caddy = proxyImage();
    execFileSync('docker', ['pull', '--platform', platform, caddy], {
      stdio: 'inherit',
    });
    inspectImage(caddy, platform);
    docker('image', 'tag', caddy, proxyTag);
    execFileSync(
      'docker',
      [
        'image',
        'save',
        '--platform',
        platform,
        '--output',
        join(bundle, 'images.tar'),
        appTag,
        proxyTag,
      ],
      { stdio: 'inherit' },
    );
    writeFileSync(
      join(bundle, 'release.env'),
      `FORMAT_VERSION=1\nRELEASE_ID=${release}\nPLATFORM=${platform}\nAPP_IMAGE=${appTag}\nPROXY_IMAGE=${proxyTag}\n`,
    );
    for (const file of bundleFiles.slice(2)) {
      mkdirSync(dirname(join(bundle, file)), { recursive: true });
      copyFileSync(join(sourceRoot, file), join(bundle, file));
    }
    const sums = [];
    for (const file of bundleFiles)
      sums.push(`${await sha256(join(bundle, file))}  ${file}\n`);
    writeFileSync(join(bundle, 'SHA256SUMS'), sums.join(''));
    const packed = join(staging, 'release.tar.gz');
    execFileSync('tar', ['-czf', packed, '-C', staging, name], {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
      stdio: 'inherit',
    });
    // Expose complete files only after every build/export/checksum step succeeds.
    const digest = await sha256(packed);
    copyFileSync(packed, archive, constants.COPYFILE_EXCL);
    writeFileSync(checksum, `${digest}  ${basename(archive)}\n`, {
      flag: 'wx',
    });
    console.log(`Release bundle: ${archive}\nSHA256: ${digest}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
