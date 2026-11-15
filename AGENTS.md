# Engineering rules

The single source of truth for this project's own facts and choices. The shared engineering rules
(components, logic, styles, Tailwind, forms, motion, i18n, tests, git, done) come from agent-rules:
the marked block at the end of this file and `.claude/rules/profile/`. `DESIGN.md` holds the visual
rules, `docs/` the plans and drafts. Rule IDs (DS-2, CSS-2, ...) are the ones the linters print.
If a statement here is wrong, fix it in the same PR that makes it wrong.

Feature behaviour is not described here. It lives in `docs/features/<feature>.md`, and a short rule in
`.claude/rules/features/<feature>.md` (loaded only when you touch that feature's code) points to it.

## Feature map

Read the feature doc before changing a feature's behaviour. Index: `docs/features/README.md`.

| Feature | Doc | Main code |
| --- | --- | --- |
| Chat, realtime | `docs/features/chat.md` | `components/chat`, `lib/chat`, `lib/realtime`, `worker/realtime.ts`, `lib/server/chat-repo.ts` |
| Requests, feed | `docs/features/requests.md` | `components/requests`, `lib/requests`, `lib/feed`, `lib/server/request-repo.ts` |
| Deals, payments, escrow | `docs/features/deals-payments.md` | `lib/deals`, `components/deals`, `lib/crypto`, `components/wallet`, `lib/monobank` |
| Legal consents | `docs/features/legal-consents.md` | `lib/legal`, `components/legal`, `lib/server/legal-*.ts` |
| Account deletion | `docs/features/account-deletion.md` | `lib/server/account-*.ts`, `lib/account`, `components/account` |
| Customer phone | `docs/features/phone.md` | `lib/phone`, `lib/server/phone-*.ts`, `components/phone` |
| Telegram, notifications | `docs/features/telegram.md` | `lib/telegram`, `lib/server/notify*.ts`, `app/api/telegram` |
| SEO pages (profile, catalog, JSON-LD, sitemap) | `docs/features/seo.md` | `app/(site)`, `app/(map)/@modal`, `lib/seo`, `lib/tags/catalog.ts`, `lib/server/catalog-repo.ts`, `components/profile-page`, `components/catalog-page` |
| Security (CSP, limits, Turnstile, ids) | `docs/features/security.md` | `lib/security-headers.ts`, `lib/server/rate-limit.ts`, `lib/server/turnstile.ts`, `lib/ids.ts` |
| Feature flags | `docs/features/feature-flags.md` | `lib/features`, `lib/server/features.ts`, `app/admin/features` |

## Stack

- Next.js 16 App Router (Turbopack), React 19, TypeScript strict. Runs on Cloudflare Workers through OpenNext
  (`worker/index.ts` wraps the OpenNext worker and adds WebSockets on a Durable Object).
- Tailwind CSS v4, configured in CSS: the tokens and the `@theme inline` block live in
  `app/globals.css`. There is no `tailwind.config`.
- Radix (the combined `radix-ui` package), cmdk and lucide-react; primitives in `components/ui`.
- Map: MapLibre GL in a globe projection (`lib/map`, `components/map`, `components/maplibre`).
- Data: Drizzle ORM on Cloudflare D1 (`db/`, migrations in `db/migrations`), a second D1 for telemetry
  (`kit/telemetry`), R2 for uploads. API routes read and check the request body by hand (`readJson` in
  `lib/api/problem.ts`); `route()` in `lib/server/route.ts` (session, rate limit, zod body, `failure()` logging) wraps a handler and new routes use it; zod is used in `lib/notification-prefs.ts` and `lib/monobank/client.ts` only.
- Wallets: wagmi 3 + viem + react-query (`components/wallet`, `lib/crypto/pay-flow.ts`). They load only through
  `next/dynamic` in the payment and requisites panels; nothing imports them on the home page or the map. The
  end-to-end check against a local Hardhat node is `npm run test:chain` (needs `contracts` built). Escrow rules:
  `docs/features/deals-payments.md`.
- `kit/` is a git subtree from `web-kit` (`npm run kit:pull`, `kit:push`); change it there, not here.
- Tests: Vitest with two projects, `unit` (`tests/unit`, node; repositories run against in-memory D1 and R2) and `hooks`
  (`tests/hooks/**/*.test.tsx`, jsdom + `@testing-library/react`, modules mocked at the boundary). `npm test` runs both. No Playwright yet.
- `@next/eslint-plugin-next` follows the Next major (`^16.4.3`); the shared lint config in
  `config/agent-rules` reads both the 15.x and the 16.x plugin shape.

## Choices the profile leaves to the project (RULES-5)

- Token file: `app/globals.css`. Current state: tokens (`:root`, `@theme inline`) share the file
  with feature CSS; splitting them is pending.
- Forms: React Hook Form + Yup through controlled wrappers (FORM-1) is the target. Current state: neither is
  installed, forms keep their own state and validate by hand; migration pending.
- Types: namespaces in the component file (COMP-16..18).
- Animation: GSAP only (COMP-7). Current state: Motion is still imported in many files, among them the
  animated icons in `components/icons`. Count: `grep -rlE "from ['\"](motion|framer-motion)" --include='*.ts' --include='*.tsx' app components lib | wc -l`
  (the same with `gsap` counts GSAP). Treat the Motion code as legacy: no new Motion imports, migrate when a file is touched.
- Folder layout: files are kebab-case, components PascalCase. Small components are flat in
  `components/`; a feature with several components lives in `components/<feature>/`. There is no `hooks/`
  folder (COMP-13 names one): a hook of one feature sits next to its component (`use-*.ts`), UI hooks shared by
  several features live in `lib/ui/`, other shared hooks next to their domain code in `lib/`. Server code in `lib/server`.
- Git flow: work on `development`. Commit messages are in Ukrainian, as in the history. The HTTPS
  `origin` resolves to a work account, so push over SSH: `git push git@github.com:todorowMax/uposhuku.git development`.
- Locales: the page is Ukrainian (`<html lang="uk">`). No i18n library and no message files exist yet;
  other locales are not set.
- Languages: rules and `AGENTS.md` are in English; task documents (`docs/tasks`) in Russian with the statuses
  from the template (todo, in progress, done, blocked, dropped); UI text in Ukrainian. Feature docs in
  `docs/features` stay in Ukrainian, as they were written.
- First-load JS budget (uncompressed, bytes): the budgets live in `scripts/bundle-budget.json` and CI checks them after
  `npx next build` with `npm run budget` (`scripts/check-bundle-budget.mjs`). Measured on 2026-11-16: `/` 1 622 809
  (budget 1 650 000), the intercepting `/(.)p/[id]` 1 637 829 (1 700 000), `/p/[id]`, `/poslugy/...` about 496 000 and
  `/zapyt/[id]` 483 000 (550 000 each). The side panels (offers, feed, profile editor, placement dialog) load through
  `next/dynamic` when opened (`components/map/lazy-panels.tsx`); the inbox panel stays in the first load because it polls for
  conversations. A bigger number means something heavy landed in `app/(map)/layout.tsx`: load it lazily or raise the budget
  in `scripts/bundle-budget.json` on purpose and update the numbers here.

## Environments and deploy

- `wrangler.jsonc` defines two environments. `development`: worker `uposhuku-development`, domain
  `dev.findlyfy.com`, `DEPLOY_ENV=development`, test sign-in (`MAIL_MODE=dev`). `production`: worker
  `uposhuku`, domains `findlyfy.com` and `www.findlyfy.com`, own D1 database and R2 bucket.
- Deploy is by hand: `npm run cf:deploy:development` and `cf:deploy:production`; D1 migrations are
  `db:migrate:development` and `db:migrate:production`. Secrets go in with `wrangler secret put`,
  never into `wrangler.jsonc`. The production deploy first removes `.open-next/assets/map/faces`
  (`scripts/strip-prod-assets.mjs`); `opennextjs-cloudflare deploy` does not rebuild assets from `public/`, so run
  `npm run cf:build` again before a development deploy.
- Per-environment variables (escrow cap `CRYPTO_MAX_DEAL_USDT`, safe-deal mode, feature-flag modes, Turnstile keys,
  `PHONE_HASH_KEY`, `ADMIN_TOTP_SECRET`) are set in `wrangler.jsonc` or as secrets; what each does and the values
  per environment: the feature docs in the map above. Variable names with placeholders: `.dev.vars.example`.
- Індексація й адреса сайту (`lib/seo/indexing.ts`, `lib/server/seo.ts`): сайт відкритий для пошуковиків лише коли `DEPLOY_ENV=production` і змінна `SEO_INDEXING=on`; типово закрито всюди, на dev і локально `on` нічого не відкриває. Від одного перемикача залежать `app/robots.ts` (`Sitemap:` лише коли відкрито), `robots` у `generateMetadata` кореневого layout і заголовок `X-Robots-Tag` у `worker/index.ts` (відкрито: не ставиться, щоб не перекрити `noindex` окремих сторінок, наприклад закритого запиту). `SITE_URL` (прод `https://findlyfy.com`, dev `https://dev.findlyfy.com`, у `wrangler.jsonc`) дає `metadataBase`, canonical і карту сайту; без нього `http://localhost:3031`. Карта сайту бере з бази лише id профілів.
- `.github/workflows/ci.yml` only checks (lint:ci, deadcode, typecheck, tests, `next build` + `npm run budget`) on pushes to `development` and on
  pull requests to `development` and `main`. It does not deploy. A production branch is not set.

## Styles

- Tailwind utilities in JSX. Colours, radii, type sizes and layers are tokens (`DESIGN.md`).
  Map colours live in `lib/map/palette.ts` in sRGB because MapLibre cannot read CSS variables.

## Legacy and the lint ratchet

Older code predates some of the shared rules. The linters report it as warnings and
`npm run lint:ci` fails when the number grows. The ceilings are the `--max-warnings` values of `lint:ci` in
`package.json`. They only go down: fix findings in the files you touch and lower the
ceiling in the same PR; never silence a rule to get past it. `npm run deadcode` lists dead code.

## Before you say "done"

- `npm run lint`, `npm run typecheck` and `npm test` pass.

## Repository

- `.dev.vars`, `.env` and `.env.local` are git-ignored; `.dev.vars.example` documents the variables.

<!-- agent-rules:profile v2 start -->
## Files, folders and rule files

- RULES-1. One source of truth: root `AGENTS.md` holds engineering rules, `DESIGN.md` the visual rules (at the root by default; a project whose `AGENTS.md` names another location, such as `.agents/context/DESIGN.md`, keeps it there, one place only); `CLAUDE.md`, `.cursor/rules/*` and Copilot files only point to them. Why: Demo had four rule sets that disagreed on token location, feature CSS and forms. Check: review. Example: ukoshiku/AGENTS.md
- RULES-2. A rule never describes infrastructure, paths or names that no longer exist; fix the rule in the PR that changes the thing. Why: a rule saying "D1 was removed" while D1 was the main store misled agents. Check: review.
- RULES-4. `DESIGN.md` names tokens and primitives as the source of truth, never feature stylesheets; token values (radii, minimum text size, button sizes, breakpoints) live there, the profile only requires that they are tokens. Why: listing `landing-components.css` as a reference taught agents to copy one-off CSS. Check: review. Example: ukoshiku/DESIGN.md
- RULES-5. The project's `AGENTS.md` records every choice this profile leaves open: token file, form stack, animation approach, folder layout, git flow, locales, JS budget. Why: undocumented choices are what made rule sets contradict each other. Check: review.
- DS-1. Before adding a control or visual pattern, search `components/ui`, form wrappers, feature folders and existing usages; reuse the primitive and its variants. Why: every local button or modal is a fork of the design system. Check: review.
- DS-3. If no primitive fits, add one to `components/ui` first: take the shadcn/Radix component, restyle it to project tokens, give it all states (hover, focus-visible, active, disabled, loading, error), keyboard and 375 px; then use it. Typical gaps: Popover, DropdownMenu, Tabs, RadioGroup, Switch, Tooltip, Textarea, Checkbox, Chip, a choice card, responsive Dialog/Drawer. Why: Demo had hand-built popovers and 60 native buttons because these were missing. Check: review. Example: ukoshiku/components/ui/popover.tsx
- COMP-4. Files are kebab-case. A small component is flat (`components/<name>.tsx`); one that grows a hook, types or parts gets `components/<name>/` with `<name>.tsx`, `use-<name>.ts`, `parts/` (its types stay in the component file, COMP-16); several components of one feature live in `components/<feature>/`. Why: mixed conventions made big flat files with no hook or parts. Check: ESLint `check-file/filename-naming-convention` (eslint-plugin-check-file, kebab-case file names); folder layout is review. Example: ukoshiku/components/recipe-editor/use-recipe-editor.ts
- COMP-13. Placement map: routes in `app/`, primitives in `components/ui`, form wrappers in one folder, schemas in `validation/`, hooks shared by 2+ features in `hooks/`, non-React code in `lib/`, schema and migrations in `db/`, tests in `tests/unit` and `tests/e2e`, specs and plans in `docs/`. Split by responsibility, not by line count: see `architecture.md`. Why: new code lands where the next agent expects it. Check: review.
- REPO-2. The repo root holds config, `README.md`, `AGENTS.md`, `DESIGN.md` and `PRODUCT.md`; specs, plans and research go to `docs/` in subfolders with a `docs/README.md` index. Why: Ukoshiku had 25 markdown files in the root before cleanup. Check: review. Example: ukoshiku/docs/README.md
- REPO-3. `README.md` says how to install, run, test and deploy; `lint`, `typecheck` and `test` scripts exist and pass. Why: a reviewer opens the README first. Check: npm scripts in CI.
- REPO-4. No archives, build output, large binaries or generated files in git. Why: they bloat clones and hide real diffs. Check: review, `.gitignore`.
- REPO-5. Every `npm run <script>` named in the README exists in `package.json`; fix the README in the PR that renames the script. Why: quick starts rot silently. Check: review.

### Profile rules by topic

- When designing, splitting or refactoring components, hooks and modules, read .claude/rules/profile/architecture.md and follow it.
- When touching Cloudflare Workers config, D1, migrations or deploy workflows, read .claude/rules/profile/cloudflare.md and follow it.
- When writing or editing a React component or its JSX, read .claude/rules/profile/components.md and follow it.
- When building or editing a form, a field or a validation schema, read .claude/rules/profile/forms.md and follow it.
- When writing or changing user-visible text, translations or locale files, read .claude/rules/profile/i18n.md and follow it.
- When adding or changing animation, transitions or motion, read .claude/rules/profile/motion.md and follow it.
- When writing React state, effects, hooks, pages or TypeScript types, read .claude/rules/profile/react-logic.md and follow it.
- When writing or reviewing JSX structure, landmarks, headings, buttons and links, forms, focus, tabindex or ARIA, read .claude/rules/profile/semantics.md and follow it.
- When editing CSS, stylesheets, tokens or visual styling in JSX, read .claude/rules/profile/styles.md and follow it.
- When editing Tailwind classes, the @theme block or class merging, read .claude/rules/profile/tailwind.md and follow it.
- When writing tests or setting up linters, formatter and CI checks, read .claude/rules/profile/testing.md and follow it.
<!-- agent-rules:profile v2 end -->
