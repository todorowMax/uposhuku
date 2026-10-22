// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Option defaults and the legacy policy.
//
// `legacy` decides which rule groups report warnings (legacy code under the ratchet, RULES-3)
// and which report errors (new code):
//   legacy: false                          every group is an error (new project)
//   legacy: true                           every group is a warning (first rollout)
//   legacy: { syntax: true, style: true }  only these groups stay warnings, the rest are errors
// Groups: syntax (no-restricted-syntax), imports (no-restricted-imports), style (func-style,
// prefer-arrow-callback, no-else-return), types (no-explicit-any, consistent-type-imports,
// TypeScript recommended set), fileNames (kebab-case), floating (no-floating-promises), hygiene
// (eslint-plugin-react, the react-hooks recommended preset, import/no-anonymous-default-export), a11y
// (the jsx-a11y recommended set beyond the six rules eslint-config-next enabled; SEM-1..SEM-12).
// Smoke detectors (cognitive-complexity, max-depth, max-params, max-lines, exhaustive-deps) are
// always warnings; rules-of-hooks is always an error.
//
// Strict mode: with AGENT_RULES_STRICT=1 in the environment `legacy` is ignored and every group is an
// error. The edit hook and the pre-commit script use it and keep only messages on changed lines.

export const DEFAULTS = {
  uiDir: "components/ui",
  appDir: "app",
  componentsDir: "components",
  testsDir: "tests",
  legacy: false,
  typed: false,
  tsconfigRootDir: undefined,
  ignores: [],
  a11yComponents: {},
  a11yPreferTag: false,
  extraConfigs: [],
};

export const isStrict = () => process.env.AGENT_RULES_STRICT === "1";

export const normalizeOptions = (options = {}) => ({ ...DEFAULTS, ...options, ...(isStrict() ? { legacy: false } : {}) });

export const severityFor = (legacy, group) => {
  const isLegacy = legacy === true || (typeof legacy === "object" && legacy !== null && legacy[group] === true);
  return isLegacy ? "warn" : "error";
};
