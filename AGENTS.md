# Agent instructions

<!-- agent-rules:profile v1 start -->
## Files, folders and rule files

- RULES-1. One source of truth: root `AGENTS.md` holds engineering rules, root `DESIGN.md` the visual rules; `CLAUDE.md`, `.cursor/rules/*` and Copilot files only point to them. Why: Demo had four rule sets that disagreed on token location, feature CSS and forms. Check: review. Example: ukoshiku/AGENTS.md
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
<!-- agent-rules:profile v1 end -->
