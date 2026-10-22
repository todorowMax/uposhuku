// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// The jsx-a11y `recommended` set as the `a11y` legacy group (SEM-1..SEM-12, DS-7, FORM-4).
// The six rules that eslint-config-next enabled stay in nextBlocks (always warnings, no group);
// this block adds the rest of `recommended` plus one rule the preset omits.
import jsxA11y from "eslint-plugin-jsx-a11y";
import { NEXT_SIX } from "./groups.mjs";
import { severityFor } from "./options.mjs";

// Not in the preset: aria-hidden on focusable content. `prefer-tag-over-role` is opt-in
// (`a11yPreferTag: true`): it wants <output> for role="status" and <dialog> for role="dialog",
// which contradicts the live-region and Radix guidance in the semantic-html skill (DECISIONS).
const EXTRA = ["jsx-a11y/no-aria-hidden-on-focusable"];

// Shared primitives understood as the element they render (rules check them like the tag).
// Projects add their own through the `a11yComponents` option.
export const DEFAULT_COMPONENTS = { Button: "button", Link: "a", Input: "input", Textarea: "textarea" };

const isOff = (v) => v === "off" || v === 0 || (Array.isArray(v) && (v[0] === "off" || v[0] === 0));
const withSeverity = (severity, value) => (Array.isArray(value) ? [severity, ...value.slice(1)] : severity);

// Rule options that need our components: Next Link for anchors, Label and the form primitives for labels.
const tuned = (severity) => ({
  "jsx-a11y/anchor-is-valid": [severity, { components: ["Link"], aspects: ["noHref", "invalidHref", "preferButton"] }],
  "jsx-a11y/label-has-associated-control": [
    severity,
    {
      labelComponents: ["Label"],
      controlComponents: ["Input", "Textarea", "Select", "Checkbox", "Switch", "RadioGroupItem"],
      assert: "either",
      depth: 3,
    },
  ],
});

export const a11yRules = (o) => {
  const severity = severityFor(o.legacy, "a11y");
  const preset = jsxA11y.flatConfigs.recommended.rules;
  const fromPreset = Object.entries(preset).filter(([name, value]) => !NEXT_SIX.has(name) && !isOff(value));
  const entries = [...fromPreset.map(([name, value]) => [name, withSeverity(severity, value)]), ...[...EXTRA, ...(o.a11yPreferTag ? ["jsx-a11y/prefer-tag-over-role"] : [])].map((name) => [name, severity])];
  return { ...Object.fromEntries(entries), ...tuned(severity) };
};

export const a11yBlock = (o) => ({
  files: ["**/*.{jsx,tsx}"],
  plugins: { "jsx-a11y": jsxA11y },
  settings: { "jsx-a11y": { components: { ...DEFAULT_COMPONENTS, ...o.a11yComponents } } },
  rules: a11yRules(o),
});
