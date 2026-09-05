// Vite selects the provider at build time. Cloudflare modules never enter the
// Node build, and filesystem/credential code never enters the Sites build.
export { runtime } from '#runtime-provider';
