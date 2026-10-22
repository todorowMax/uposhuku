// stylelint.config.mjs
//
// The rules come from the shared agent-rules package (config/agent-rules).
// app/globals.css holds the design tokens (:root, @theme) and also the feature stylesheet, so raw
// colours are allowed in all of it for now. Moving the tokens to their own file is a migration
// item (agent-rules DECISIONS, L).
import { createConfig } from "./config/agent-rules/stylelint.mjs";

export default createConfig({
  tokenFiles: ["app/globals.css"],
  ignoreFiles: ["kit/**"],
  legacy: true,
});
