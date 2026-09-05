# Repository Guidelines

## Project Structure & Module Organization

This TypeScript/React blog uses Vinext with Sites and standalone Node runtimes.

- `app/`: public pages, `/admin`, article APIs, media routes, and global styles.
- `components/`: shared UI; `admin/` contains the editor and `ui/` reusable primitives.
- `lib/`: article logic, sanitization, authentication, and runtime adapters; `server/` implements Node authentication and storage.
- `db/schema.ts` and `drizzle/`: schema and SQL migrations.
- `content/notes/`: initial seed articles; subsequent edits live in the database. `public/` holds static assets and font licenses.
- `tests/` and `scripts/`: automated checks. `deploy/` and `docs/` cover self-hosting.

## Build, Test, and Development Commands

Use Node.js from `.nvmrc` and retain `package-lock.json`.

- `npm ci`: install locked dependencies.
- `npm run db:migrate && npm run dev`: migrate local D1 and start development; use the printed URL.
- `npm run check && npm run lint`: run TypeScript and Oxlint checks.
- `npm run format -- <path>`: format selected files with Oxfmt.
- `npm test && npm run test:node`: run content and Node unit tests.
- `npm run build && npm run verify`: build and validate Sites output.
- `npm run build:node && npm run verify:node && npm run test:deploy`: build Node output and verify packaging and deployment behavior.

For Node configuration, migrations, and startup, follow [the deployment guide](docs/deploy-ubuntu-26.04.md). Build targets share `dist/`; rebuild when switching targets.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted JavaScript strings, semicolons, and Oxfmt's 80-column target. Keep TypeScript strict; avoid `any`. Use PascalCase component names, camelCase functions, kebab-case filenames, and `@/` imports. Reuse existing UI primitives and preserve runtime isolation.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`: `tests/*.test.ts` for content and `tests/node-*.test.mjs` for Node behavior. No numeric coverage threshold is configured. Add regression cases for changed security or persistence behavior. Deployment changes also require `npm run test:compose`, with Docker and a built `sparsity:release` image.

## Commit & Pull Request Guidelines

Follow history's imperative prefixes: `feat:`, `fix:`, `style:`, or `refactor:`. Keep commits focused. PRs should describe behavior changes, link relevant issues, report validation, and include screenshots for visual changes. Explain migration or deployment impacts; preserve unrelated worktree changes.

## Security & Configuration

Keep secrets, databases, and generated output untracked. Preserve `.openai/hosting.json` bindings; Sites manages remote resources. Generate schema changes with `npm run db:generate`; never edit applied migrations. Enforce administrator authorization and request-origin checks on the server.
