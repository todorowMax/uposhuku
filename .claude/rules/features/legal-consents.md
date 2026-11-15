---
paths: ["**/lib/legal/**", "**/components/legal/**", "**/lib/server/legal-*.ts", "**/app/api/legal/**"]
trigger: touching legal texts, consents, risk acknowledgement or their gates
---
# Legal consents

Feature doc: `docs/features/legal-consents.md` (versions, gates, error codes, test helpers).

- Bump `LEGAL_VERSIONS` (`lib/legal/config.ts`) by hand when the meaning of a text changes; that triggers re-acceptance.
- Money actions without current consent answer 409 `legal_reaccept_required`; USDT actions without `cryptoRisk` answer 409 `risk_ack_required`.
- A new USDT money action adds `cryptoGate` on the server and `withRiskAck` or `ensureRiskAck` on the client.
- In tests `makeUser` accepts all documents; `accepted: false` leaves the user without consents.
