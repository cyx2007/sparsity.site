# Dependency security fixes

The September 2026 dependency update addresses Dependabot alerts
[#1](https://github.com/cyx2007/sparsity.site/security/dependabot/1),
[#21](https://github.com/cyx2007/sparsity.site/security/dependabot/21), and
[#22](https://github.com/cyx2007/sparsity.site/security/dependabot/22).

## Vinext and image-size

Vinext is pinned to `1.0.0-beta.9`, with its required RSC plugin `0.5.34`.
Starting in beta.6, Vinext bundles `image-size@2.0.2` inside its build tooling
instead of declaring it as a runtime dependency
([upstream change](https://github.com/cloudflare/vinext/pull/2913)). The vulnerable
parser remains in that bundle: a clean npm audit alone does not prove it is safe.

`scripts/patch-vinext-image-size.mjs` runs during `npm install` and `npm ci`.
It checks the exact Vinext version and original bundle SHA-256 before applying
an idempotent patch. It rejects truncated, undersized and out-of-bounds box
headers and ICNS entries so parser offsets cannot stall on zero-length entries.
Unknown bundle contents or an incomplete patch fail installation.

This addresses
[CVE-2025-71329](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) and
[CVE-2025-71330](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr).
The patch does not add support for ISO BMFF zero-length or extended-size boxes.
Docker copies the patch script before installing dependencies. Install lifecycle
scripts must run; if using `--ignore-scripts`, explicitly run
`node scripts/patch-vinext-image-size.mjs` before any development or build command.

When upgrading Vinext, inspect its bundled parser and run the security tests.
Remove this patch, the `postinstall` hook, and the early Dockerfile script copy
only after upstream fixes or removes the vulnerable implementation. Do not merely
refresh the expected hash to make an unknown bundle pass.

## Drizzle Kit and esbuild

The override for `@esbuild-kit/core-utils` pins its esbuild to `0.25.12`, addressing
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
Other tools retain their own esbuild versions. Remove the override when a stable
Drizzle Kit release no longer brings in the affected esbuild version.

`npm test` includes malformed-image regression cases in killable child processes,
valid image dimension checks, and a cross-origin test against the actual esbuild
resolved by the Drizzle loader. Keep these behavioral checks alongside `npm audit`.
