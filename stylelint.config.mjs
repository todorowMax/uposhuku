// stylelint.config.mjs
//
// The rules come from the shared agent-rules package (config/agent-rules).
// The design tokens (:root, @theme) live in app/styles/tokens.css, but the feature stylesheets in app/styles/*.css
// were split out of one file that held both, and still carry raw colours, so those are allowed in all of them for
// now. Replacing the raw colours with tokens is a migration item (agent-rules DECISIONS, L).
import { createConfig } from "./config/agent-rules/stylelint.mjs";

export default createConfig({
  tokenFiles: ["app/globals.css", "app/styles/*.css"],
  ignoreFiles: ["kit/**"],
  legacy: true,
});
