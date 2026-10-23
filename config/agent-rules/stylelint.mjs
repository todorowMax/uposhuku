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

// MOT-2: easing curves are tokens (--ease-out); a hand-written cubic-bezier() lives in the token file only.
const FUNCTIONS = [...COLOR_FUNCTIONS, "cubic-bezier"];
const functionMessage = (name) =>
  name === "cubic-bezier"
    ? `MOT-2: no hand-written ${name}(); use an easing token (var(--ease-out)) or add one to the token file.`
    : `CSS-2: colours come from tokens (var(--...)); ${name}() belongs in the token file.`;

// MOT-1: a transition never names width, height, top or left (nor min-/max- width and height).
// The regex matches the whole word, so `border-left-color` and `margin-top` pass.
const LAYOUT_PROPERTY = "/(^|[\\s,])((min-|max-)?(width|height)|top|left)(?=[\\s,;]|$)/";
const layoutMessage = (property) =>
  `MOT-1: ${property} must not animate width, height, top or left; animate transform and opacity.`;

export const createConfig = ({ tokenFiles = ["app/globals.css"], ignoreFiles = [], legacy = false } = {}) => ({
  defaultSeverity: legacy && process.env.AGENT_RULES_STRICT !== "1" ? "warning" : "error",
  ignoreFiles: [...IGNORED, ...ignoreFiles],
  rules: {
    // CSS-4: no !important; beating third-party CSS needs a disable comment with a reason.
    "declaration-no-important": true,
    // CSS-2: colours come from tokens (var(--...)); raw values live in the token file.
    "color-no-hex": true,
    "function-disallowed-list": [FUNCTIONS, { message: functionMessage }],
    // MOT-1.
    "declaration-property-value-disallowed-list": [
      { transition: [LAYOUT_PROPERTY], "transition-property": [LAYOUT_PROPERTY] },
      { message: layoutMessage },
    ],
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
