---
paths: ["**/lib/features/**", "**/lib/server/features.ts", "**/app/api/features/**", "**/app/api/admin/features/**", "**/app/admin/features/**"]
trigger: touching feature flags (modes, allowlists, admin page)
---
# Feature flags

Feature doc: `docs/features/feature-flags.md` (flag list, precedence, requisites and `foreign_links`).

- Mode is `off` | `allowlist` | `on` plus an email list. Value order: table `feature_flags` (page `/admin/features`), then `<NAME>_MODE` and `<NAME>_USERS`, then `off`.
- Pure logic stays in `lib/features`, server reads in `lib/server/features.ts`.
- The list of flags is `FEATURES` in `lib/features/flags.ts`; changing a flag in `MONEY_FEATURES` needs TOTP. `nbu_qr` and `phone_verify` are not money flags.
