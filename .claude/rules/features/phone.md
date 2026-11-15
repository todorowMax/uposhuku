---
paths: ["**/lib/phone/**", "**/components/phone/**", "**/lib/server/phone-*.ts", "**/app/api/phone/**"]
trigger: touching customer phone verification or its gate
---
# Phone

Feature doc: `docs/features/phone.md` (flag `phone_verify`, hash, mask, tombstones, 409 `phone_required`).

- The number is confirmed only in the Telegram bot by "Share number" (the contact's `user_id` must equal `from.id`). Never store or log the number: only `phone_hash` (HMAC-SHA256 of E.164 with `PHONE_HASH_KEY`) and `phone_mask`.
- With the flag on, a customer without a number gets 409 `phone_required` on publishing a request, offering and accepting a deal (`phoneGate`). Without the key, confirmation answers 503 `phone_hash_key_missing`.
- The hash is unique among living accounts; a tombstone keeps the hash, so a number with commission debt or in `phone_blocks` is not given to a new account.
