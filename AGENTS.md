# Engineering rules

The single source of truth for this project's own facts and choices. The shared engineering rules
(components, logic, styles, Tailwind, forms, motion, i18n, tests, git, done) come from agent-rules:
the marked block at the end of this file and `.claude/rules/profile/`. `DESIGN.md` holds the visual
rules, `docs/` the plans and drafts. Rule IDs (DS-2, CSS-2, ...) are the ones the linters print.
If a statement here is wrong, fix it in the same PR that makes it wrong.

## Stack

- Next.js 16 App Router (Turbopack), React 19, TypeScript strict. Runs on Cloudflare Workers through OpenNext
  (`worker/index.ts` wraps the OpenNext worker and adds WebSockets on a Durable Object).
- Tailwind CSS v4, configured in CSS: the tokens and the `@theme inline` block live in
  `app/globals.css`. There is no `tailwind.config`.
- Radix (the combined `radix-ui` package), cmdk and lucide-react; primitives in `components/ui`.
- Map: MapLibre GL in a globe projection (`lib/map`, `components/map`, `components/maplibre`).
- Data: Drizzle ORM on Cloudflare D1 (`db/`, migrations in `db/migrations`), a second D1 for telemetry
  (`kit/telemetry`), R2 for uploads. Validation: zod.
- Wallets: wagmi 3 + viem + react-query (`components/wallet`, `lib/crypto/pay-flow.ts`). They load only through
  `next/dynamic` in the payment and requisites panels; nothing imports them on the home page or the map. The
  end-to-end check against a local Hardhat node is `npm run test:chain` (needs `contracts` built).
  Escrow deals (`method: "escrow"`, amounts in whole USDT, one contract clone per stage) take their stage status only from
  the contract state (`lib/deals/escrow-state.ts`, `lib/server/escrow-sync.ts`); `CRYPTO_MAX_DEAL_USDT` caps a deal
  (default 1000, never above the factory limit read from the contract). Wallet reads go through the connected wallet's provider.
- `kit/` is a git subtree from `web-kit` (`npm run kit:pull`, `kit:push`); change it there, not here.
- Tests: Vitest (`tests/unit`, repositories run against in-memory D1 and R2). No Playwright yet.
- `@next/eslint-plugin-next` follows the Next major (`^16.4.3`); the shared lint config in
  `config/agent-rules` reads both the 15.x and the 16.x plugin shape.

## Choices the profile leaves to the project (RULES-5)

- Token file: `app/globals.css`. Current state: tokens (`:root`, `@theme inline`) share the file
  with feature CSS; splitting them is pending.
- Forms: React Hook Form + Yup through controlled wrappers (FORM-1) is the target. Current state: zod
  without React Hook Form; migration pending.
- Types: namespaces in the component file (COMP-16..18).
- Animation: GSAP only (COMP-7). Current state: Motion is still imported in 39 files, among them the
  animated icons in `components/icons`, GSAP in 13. Treat the Motion code as legacy: no new Motion
  imports, migrate when a file is touched.
- Folder layout: files are kebab-case, components PascalCase. Small components are flat in
  `components/`; a feature with several components lives in `components/<feature>/`; hooks shared by
  two features live in `hooks/`; server code in `lib/server`.
- Git flow: work on `development`. Commit messages are in Ukrainian, as in the history. The HTTPS
  `origin` resolves to a work account, so push over SSH: `git push git@github.com:todorowMax/uposhuku.git development`.
- Locales: the page is Ukrainian (`<html lang="uk">`). No i18n library and no message files exist yet;
  other locales are not set.
- First-load JS budget: the home page `/` is 1.55 MB uncompressed (`firstLoadUncompressedJsBytes` in `.next/diagnostics/route-bundle-stats.json` after `npx next build`; measured 1.51 MB). The side panels (offers, feed, profile editor, placement dialog) load through `next/dynamic` when opened (`components/map/lazy-panels.tsx`); the inbox panel stays in the first load because it polls for conversations. A bigger number means something heavy landed in `app/(map)/layout.tsx`: load it lazily or raise the budget here on purpose.

## Environments

- `wrangler.jsonc` defines two environments. `development`: worker `uposhuku-development`, domain
  `dev.findlyfy.com`, `DEPLOY_ENV=development`, test sign-in (`MAIL_MODE=dev`). `production`: worker
  `uposhuku`, domains `findlyfy.com` and `www.findlyfy.com`, own D1 database and R2 bucket.
- Deploy is by hand: `npm run cf:deploy:development` and `cf:deploy:production`; D1 migrations are
  `db:migrate:development` and `db:migrate:production`. Secrets go in with `wrangler secret put`,
  never into `wrangler.jsonc`. The production deploy first removes `.open-next/assets/map/faces`
  (`scripts/strip-prod-assets.mjs`); `opennextjs-cloudflare deploy` does not rebuild assets from `public/`, so run
  `npm run cf:build` again before a development deploy.
- Escrow cap `CRYPTO_MAX_DEAL_USDT`: development 1000, production 10000 (`wrangler.jsonc`). The production contract
  is deployed with 50 000; raising the server cap above 10 000 waits for an audit. Code default 1000 is not changed.
- Безпечна угода (гроші через Monobank) вмикається змінними `SAFE_DEAL_MODE` = `off` (типово) | `allowlist` | `on`
  та `SAFE_DEAL_USERS` (пошти через кому). Нові угоди й оплата питають режим (`lib/server/safe-deal.ts`), гроші, що вже
  в русі (вебхук, звірка, виплата, sweep), його не питають. Юридичні тексти показують її лише в режимі `on`; крипту (розділ «Крипта» в умовах, отримувачі в політиці) лише коли хоч один із `crypto_proof`, `crypto_wallet`, `crypto_escrow` у режимі `on` (`cryptoPublic()` у `lib/server/safe-deal.ts`); про `foreign_links` вони не кажуть ніде.
  Токени: `MONOBANK_TOKEN` (звичайний термінал) і `MONOBANK_SPLIT_TOKEN` (розщеплення), `MONOBANK_PLATFORM_RECEIVER_ID`.
  «Заморожено» і «виплачено» ставить лише підтверджена банком відповідь (`lib/deals/payment-status.ts`).
- Захист (`lib/security-headers.ts`, `lib/server/rate-limit.ts`): заголовки ставить воркер і `next.config.ts`; CSP лише
  Report-Only (звіти в `/api/csp-report`), HSTS не ставимо (зона Cloudflare). Ліміти частоти лежать у `RATE_RULES`.
  Грошові рішення модератора потребують `ADMIN_TOTP_SECRET`; на проді без нього вони вимкнені.
- Прапорці функцій (`safe_deal`, `crypto_proof`, `crypto_wallet`, `crypto_escrow`, `nbu_qr`, `foreign_links`): режим `off` | `allowlist` | `on`
  і список пошт. `foreign_links` вмикає PayPal і Wise у реквізитах (грошовий: TOTP і лист). Способи оплати виконавця
  (банк, USDT, гаманець, Binance ID, PayPal, Wise) в `lib/deals/requisites.ts`: усі поля необов'язкові, потрібен
  хоча б один спосіб; `paymentMethods()` дає список, `mask` без IBAN це мітка способу; «Я оплатив(ла)» пише
  `stage.paidVia` лише зі способів знімка. Значення з таблиці `feature_flags` (сторінка `/admin/features`), інакше зі змінних `<ІМ'Я>_MODE` і
  `<ІМ'Я>_USERS`, інакше `off`. Чиста логіка в `lib/features`, сервер у `lib/server/features.ts`. Зміна грошових
  прапорців потребує TOTP.
- Допомога у спорах (`lib/deals/dispute-aids.ts`, `complaints.ts`, `lib/admin/deal-timeline.ts`): «Що вважаємо готовим» (до 500) ставиться
  при створенні умов і потім не змінюється; чек (`stage.receiptAttachmentId`) це картинка з розмови угоди, угода без `conversationId`
  чек не приймає; результат етапу (`stage.delivery`: текст до 1000 і https-посилання) додається до «здати етап». Скарга на пряму угоду
  (`deal_complaints`, `POST /api/deals/:id/complaint`) гроші й статус етапу не чіпає; закриває її модератор у `/admin?tab=complaints`,
  закриття (хто, коли, коментар) лежить у самому рядку скарги, окремого журналу немає. Друга сторона бачить лише службовий рядок у розмові.
- `.github/workflows/ci.yml` only checks (lint:ci, typecheck, tests) on pushes to `development` and on
  pull requests to `development` and `main`. It does not deploy. A production branch is not set.

- Згоди (`legal_acceptances`, `lib/legal/acceptance.ts`, `lib/server/legal-repo.ts`, `lib/server/legal-gate.ts`): версії документів у `LEGAL_VERSIONS` (`lib/legal/config.ts`, рядок-дата), їх піднімають вручну, коли змінюється сенс тексту, і `UPDATED` рахується від них. Вхід вимагає `accepted: true` від нового (і від того, хто не приймав чинні умови та політику), запис із джерелом `signup`; `GET /api/legal/status`, `POST /api/legal/accept`. Грошові дії (створення й прийняття угоди, «я оплатив», заморожування, оплата безпечної угоди, розміщення, відгук) без чинних умов дають 409 `legal_reaccept_required`; дії з USDT (хеш, оплата з гаманця, ескроу, USDT і Binance ID в реквізитах, підтвердження гаманця, звірка з гаманцем замовника) ще й без `cryptoRisk` дають 409 `risk_ack_required`. Нова грошова дія з USDT на сервері додає `cryptoGate`; на клієнті `withRiskAck` (серверна відмова) або `ensureRiskAck` (до транзакції в гаманці). Нова версія документа дає повторне прийняття; у тестах `makeUser` приймає всі документи, `accepted: false` лишає без згод.
- «Перевірена угода» (`reviews.verified`, `lib/deals/verified.ts`): сервер ставить її при створенні відгуку, якщо угода `completed` і оплату кожного етапу підтвердив банк (`paidAmount`), контракт (`paidUnits`) або блокчейн (запис у `crypto_proofs`). Переказ на IBAN, Binance, PayPal і Wise ніколи не дає позначки; старі відгуки мають `verified = 0`.

## Styles

- Tailwind utilities in JSX. Colours, radii, type sizes and layers are tokens (`DESIGN.md`).
  Map colours live in `lib/map/palette.ts` in sRGB because MapLibre cannot read CSS variables.

## Legacy and the lint ratchet

Older code predates some of the shared rules. The linters report it as warnings and
`npm run lint:ci` fails when the number grows. Current ceilings (from `package.json`): ESLint
670 warnings, Stylelint 7. The numbers only go down: fix findings in the files you touch and lower the
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
