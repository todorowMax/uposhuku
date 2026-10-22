// eslint.config.mjs
//
// The rules come from the shared agent-rules package (config/agent-rules, vendored by
// agent-rules/scripts/sync.mjs; do not edit that copy). Only project facts live here.
// Legacy code reports warnings and `npm run lint:ci` caps their number (--max-warnings),
// so the count can only go down. Errors always fail.
import { createConfig } from "./config/agent-rules/eslint.mjs";

export default createConfig({
  // Groups with findings left stay warnings under the ratchet; every other group is an error.
  // Re-run config/agent-rules/scripts/count-by-group.mjs after each cleanup and drop the zeros.
  // imports holds COMP-7: the animated icons in components/icons still import motion (warnings).
  legacy: { syntax: true, imports: true, style: true, types: true, hygiene: true, a11y: true },
  // kit/ is a git subtree of web-kit and is not edited here.
  ignores: ["kit/**"],
});
