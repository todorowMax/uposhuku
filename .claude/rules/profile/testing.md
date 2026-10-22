---
paths: ["**/tests/**", "**/*.{test,spec}.{ts,tsx}", "**/eslint.config.*", "**/stylelint.config.*", "**/.prettierrc*", "**/knip.json", "**/package.json"]
trigger: writing tests or setting up linters, formatter and CI checks
---
# Testing and tooling

- RULES-3. Anything that matters (tokens only, primitives only, no `!important`, no `any`, file size) is enforced by ESLint, Stylelint, `tsc` or tests in CI. Legacy code reports warnings, CI caps their count with `--max-warnings` so it only goes down, new code gets errors; never silence a rule to get past it, fix findings in the files you touch. Why: Demo's `npm run lint` printed "no lint configured", so only text-only rules eroded. Check: `npm run lint:ci`. Example: ukoshiku/eslint.config.mjs
- FMT-1. A formatter (Prettier) is configured; no line over about 160 characters outside long strings and class lists, and no component written on one line. If most files already differ from Prettier, format only the files with extreme lines as one mechanical commit listed in `.git-blame-ignore-revs`, and format everything in a separate commit. Why: 1,000-character lines are the hardest thing to review. Check: `Prettier`, `.prettierignore`. Example: ukoshiku/.git-blame-ignore-revs
- TEST-1. End-to-end tests locate by `getByRole`, `getByLabel` or `getByTestId`, never by CSS class. Why: Demo had 34 class-based locators that blocked every stylesheet move. Check: ESLint `no-restricted-syntax` on `locator(".x")`.
- TEST-2. A refactor that should not change the look is proven with screenshots at 375, 768, 1024 and 1440 px before and after, and ships in its own PR, apart from changes that do alter the look. Why: moving CSS or swapping primitives shifts sizes by a pixel or two. Check: review.
- TEST-3. A signed-in smoke test opens every screen behind login (logging in once per file) and fails on any client exception; it asserts the final path so a redirect to `/login` cannot pass, uses a seeded local user, and skips without credentials. Why: a public test sees guest views only and a redirected test passes for the wrong reason. Check: Playwright. Example: ukoshiku/tests/e2e/authenticated-smoke.spec.ts
- TEST-4. Code that computes money, access rights or deletes data has unit tests before it ships. Why: those are the bugs that cost money and trust. Check: review, vitest.
- TEST-5. Payment flows are changed last and verified with the provider's test keys, never with a bypass in app code. Why: Demo's checkout is where an error is most expensive. Check: review.
