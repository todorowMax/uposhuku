// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Which `legacy` group a rule belongs to (see options.mjs). null: always its own level, no group.

// The six jsx-a11y rules eslint-config-next enabled: always warnings, outside the groups.
export const NEXT_SIX = new Set([
  "jsx-a11y/alt-text",
  "jsx-a11y/aria-props",
  "jsx-a11y/aria-proptypes",
  "jsx-a11y/aria-unsupported-elements",
  "jsx-a11y/role-has-required-aria-props",
  "jsx-a11y/role-supports-aria-props",
]);

const STYLE = new Set(["func-style", "prefer-arrow-callback", "no-else-return"]);

export const GROUPS = ["syntax", "imports", "style", "types", "fileNames", "floating", "hygiene", "a11y"];

export const groupOf = (ruleId) => {
  if (!ruleId) return null;
  if (ruleId === "no-restricted-syntax") return "syntax";
  if (ruleId === "no-restricted-imports") return "imports";
  if (STYLE.has(ruleId)) return "style";
  if (ruleId.startsWith("check-file/")) return "fileNames";
  if (ruleId === "@typescript-eslint/no-floating-promises") return "floating";
  if (ruleId === "@typescript-eslint/no-unused-vars") return null;
  if (ruleId.startsWith("@typescript-eslint/")) return "types";
  if (ruleId === "react-hooks/rules-of-hooks" || ruleId === "react-hooks/exhaustive-deps") return null;
  if (ruleId.startsWith("jsx-a11y/")) return NEXT_SIX.has(ruleId) ? null : "a11y";
  if (/^(react|react-hooks|import)\//.test(ruleId)) return "hygiene";
  return null;
};

// The agent-rules ID in a no-restricted-* message ("TW-3, CSS-10: ..." gives "TW-3").
export const messageId = (message) => message.match(/(?:^|\s)([A-Z]+-\d+)(?:,|:)/)?.[1] ?? null;
