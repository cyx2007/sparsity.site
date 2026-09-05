import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, loadEnv } from 'vite';
import hostingConfig from './.openai/hosting.json' with { type: 'json' };
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async ({ command, mode }) => {
  const selfHosted = process.env.DEPLOY_TARGET === 'node';
  if (
    process.env.DEPLOY_TARGET &&
    !selfHosted &&
    process.env.DEPLOY_TARGET !== 'sites'
  )
    throw new Error('DEPLOY_TARGET must be node or sites');
  const base = {
    css: { postcss: { plugins: [tailwindcss()] } },
    resolve: {
      alias: {
        '#runtime-provider': fileURLToPath(
          new URL(
            selfHosted ? './lib/runtime-node.ts' : './lib/runtime-sites.ts',
            import.meta.url,
          ),
        ),
      },
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
  };
  if (selfHosted) return { ...base, plugins: [vinext()] };
  if (command === 'build') rmSync('dist/node-manifest.json', { force: true });
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    ...base,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: {
          ...localBindingConfig,
          ...(command === 'serve'
            ? {
                vars: {
                  SITE_OWNER_EMAIL:
                    loadEnv(mode, process.cwd(), 'SITE_').SITE_OWNER_EMAIL ||
                    'seedy@sites.test',
                },
              }
            : {}),
        },
      }),
    ],
  };
});
