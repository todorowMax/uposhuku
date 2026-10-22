// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Shared ESLint flat config for the agent-rules profile.
//
//   import { createConfig } from "./config/agent-rules/eslint.mjs";
//   export default createConfig({ legacy: true });
//
// Options: see src/options.mjs. Every rule message starts with the agent-rules ID.
import { a11yBlock } from "./src/a11y.mjs";
import {
  codeRules, e2eBlock, fileNameBlock, hooksBlock, ignoreBlock, nextBlocks, pageBlock, parserBlocks, productBlocks, testFileBlock,
  reactBlocks, typedBlock, typescriptRules,
} from "./src/blocks.mjs";
import { normalizeOptions } from "./src/options.mjs";

export { severityFor } from "./src/options.mjs";

export const createConfig = (options) => {
  const o = normalizeOptions(options);
  return [
    ignoreBlock(o),
    ...o.extraConfigs,
    ...nextBlocks(),
    a11yBlock(o),
    ...parserBlocks(o),
    codeRules(o),
    hooksBlock(o),
    ...reactBlocks(o),
    typescriptRules(o),
    ...productBlocks(o),
    pageBlock(o),
    e2eBlock(o),
    fileNameBlock(o),
    testFileBlock(o),
    ...(o.typed ? [typedBlock(o)] : []),
  ];
};

export default createConfig;
