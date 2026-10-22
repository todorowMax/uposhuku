// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Shared Stylelint config for the agent-rules profile (CSS-1, CSS-2, CSS-4, CSS-5).
//
//   import { createConfig } from "./config/agent-rules/stylelint.mjs";
//   export default createConfig({ tokenFiles: ["app/globals.css"], legacy: true });
//
// Only the rules a tool can check; no formatting rules and no stylelint-config-standard, so legacy
// CSS does not drown in warnings.
//
// Options:
//   tokenFiles   CSS files that hold raw colours (the token file); default ["app/globals.css"]
//   ignoreFiles  extra globs to skip
//   legacy       true: findings are warnings (ratchet via --max-warnings); false: errors
//                AGENT_RULES_STRICT=1 in the environment ignores it (errors), see src/options.mjs

const IGNORED = [
  ".next/**", ".open-next/**", ".wrangler/**", ".claude/**", ".agents/**", "node_modules/**", "public/**",
  "coverage/**", "test-results/**", "playwright-report/**", "config/agent-rules/**",
];

const COLOR_FUNCTIONS = ["rgb", "rgba", "hsl", "hsla", "oklch", "oklab", "lab", "lch", "hwb", "color"];

export const createConfig = ({ tokenFiles = ["app/globals.css"], ignoreFiles = [], legacy = false } = {}) => ({
  defaultSeverity: legacy && process.env.AGENT_RULES_STRICT !== "1" ? "warning" : "error",
  ignoreFiles: [...IGNORED, ...ignoreFiles],
  rules: {
    // CSS-4: no !important; beating third-party CSS needs a disable comment with a reason.
    "declaration-no-important": true,
    // CSS-2: colours come from tokens (var(--...)); raw values live in the token file.
    "color-no-hex": true,
    "function-disallowed-list": COLOR_FUNCTIONS,
    // CSS-1, CSS-5: edit the existing rule instead of appending another one.
    "no-duplicate-selectors": true,
    "declaration-block-no-duplicate-properties": [true, { ignore: ["consecutive-duplicates-with-different-values"] }],
  },
  overrides: [
    {
      files: tokenFiles,
      rules: { "color-no-hex": null, "function-disallowed-list": null },
    },
  ],
});

export default createConfig;
