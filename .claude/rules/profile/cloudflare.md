---
paths: ["**/wrangler.{jsonc,json,toml}", "**/open-next.config.ts", "**/worker/**", "**/db/**", "**/.github/workflows/**", "**/.dev.vars*"]
trigger: touching Cloudflare Workers config, D1, migrations or deploy workflows
---
# Cloudflare

- CF-1. Per-environment values live in the environment blocks of `wrangler.jsonc`; secrets only via `wrangler secret` or the git-ignored `.dev.vars`, and their names are documented in `.dev.vars.example`. Why: a committed secret must be rotated. Check: review. Example: ukoshiku/wrangler.jsonc
- CF-2. D1 schema changes are new migration files in `db/migrations`, applied by CI before the deploy step; an applied migration is never edited. Why: editing history makes dev and prod diverge. Check: review. Example: ukoshiku/.github/workflows/deploy.yml
- CF-3. Code must run on workerd: use fetch-based clients (for Stripe `createFetchHttpClient`) and Web APIs, and avoid Node-only modules unless `nodejs_compat` is on. Why: Stripe's default Node client hung for 80 seconds on Workers. Check: review, OpenNext build.
- CF-4. Before a production release, run the built bundle through the OpenNext preview and check dynamic routes; `next dev` is not the production runtime. Why: a worktree release once skipped required middleware patches. Check: `opennextjs-cloudflare preview`, review.
- CF-5. Install dependencies in the checkout you build in; never symlink `node_modules` from another checkout. Why: shared paths bypassed the patches a release build needs. Check: review.
- CF-6. No floating promises in Workers: `await` them or hand them to `ctx.waitUntil`. Why: the runtime may end before a detached promise finishes. Check: ESLint `@typescript-eslint/no-floating-promises`, which needs the typed config (`typed: true` in the shared ESLint config).
