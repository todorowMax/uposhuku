// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Pure helpers for the warning ratchet: read the `--max-warnings N` baselines out of the `lint:ci`
// script, plan a lowering, and rewrite package.json text without touching anything else.

const TOOL = /^(?:npx\s+)?(eslint|stylelint)\b\s*(.*)$/;
const MAX_WARNINGS = /\s*--max-warnings(?:\s+|=)(\d+)/;

// Split a command line into arguments; double and single quotes group, no other shell syntax.
export const tokenize = (text) =>
  [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);

// { eslint: { args, baseline }, stylelint: { ... } } from the `lint:ci` script. A segment without
// `--max-warnings` has no baseline and is left out (nothing to ratchet).
export const parseLintCi = (script) => {
  const tools = {};
  for (const segment of String(script ?? "").split("&&")) {
    const m = segment.trim().match(TOOL);
    const limit = m?.[2].match(MAX_WARNINGS);
    if (!m || !limit) continue;
    tools[m[1]] = { args: tokenize(m[2].replace(MAX_WARNINGS, "")), baseline: Number(limit[1]) };
  }
  return tools;
};

// New baselines: a tool whose actual count dropped gets the actual count; a count that did not
// drop (equal, higher or unknown) keeps its baseline. Never raises.
export const lowered = (tools, actual) =>
  Object.fromEntries(
    Object.entries(tools).map(([name, { baseline }]) => {
      const now = actual[name];
      return [name, Number.isInteger(now) && now >= 0 && now < baseline ? now : baseline];
    }),
  );

const withBaseline = (script, tool, value) =>
  script
    .split("&&")
    .map((segment) => (TOOL.exec(segment.trim())?.[1] === tool ? segment.replace(MAX_WARNINGS, ` --max-warnings ${value}`) : segment))
    .join("&&");

export const rewriteScript = (script, baselines) =>
  Object.entries(baselines).reduce((text, [tool, value]) => withBaseline(text, tool, value), script);

// Replace the `lint:ci` string inside the raw package.json text, keeping indentation, key order and
// the final newline. Returns null when the old script is not found exactly once.
export const rewritePackage = (raw, oldScript, newScript) => {
  const from = JSON.stringify(oldScript);
  if (raw.split(from).length !== 2) return null;
  return raw.replace(from, () => JSON.stringify(newScript));
};
