---
paths: ["**/lib/security-headers.ts", "**/next.config.ts", "**/lib/server/rate-limit.ts", "**/lib/server/turnstile.ts", "**/lib/auth/turnstile-client.ts", "**/components/auth/use-turnstile.ts", "**/app/api/csp-report/**", "**/app/api/auth/turnstile/**", "**/lib/ids.ts", "**/lib/server/admin-money.ts"]
trigger: touching security headers, CSP, rate limits, Turnstile, ids or moderator money decisions
---
# Security

Feature doc: `docs/features/security.md` (split CSP, rate rules, Turnstile, ids, moderator TOTP).

- `Content-Security-Policy` is enforced with only `frame-ancestors`, `object-src`, `base-uri`, `form-action`; the full policy stays in `Content-Security-Policy-Report-Only`. A new external source (script, frame, network) is added to `contentSecurityPolicy`; a form with `action` on another host breaks `form-action`. No HSTS (Cloudflare zone).
- Rate limits live in `RATE_RULES`.
- New `deal_`, `req_`, `conv_`, `rev_` ids are prefix + 16 hex; never parse an id by its length.
- Moderator money decisions need `ADMIN_TOTP_SECRET`; in production without it they are off.
