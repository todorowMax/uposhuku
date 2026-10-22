#!/usr/bin/env node
// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Count findings per `legacy` group, as if every group were an error (AGENT_RULES_STRICT=1), so you
// can write `legacy: { ...groups that still have findings }` and switch the others to strict at once.
// Zero dependencies. Read-only: no cache, nothing is written.
//
//   node config/agent-rules/scripts/count-by-group.mjs [--eslint-bin <path>] [--config <file>] [--json] [paths...]
//
// Run from the project root. Default path is "."; the project's own eslint.config is used unless --config.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { GROUPS, groupOf, messageId } from "../src/groups.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args.splice(i, 2)[1];
};
const json = args.includes("--json") && args.splice(args.indexOf("--json"), 1).length > 0;
// Default: the nearest node_modules/.bin/eslint from the working directory upwards (hoisted workspaces).
const nearestBin = (name) => {
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const bin = path.join(dir, "node_modules", ".bin", name);
    if (fs.existsSync(bin) || path.dirname(dir) === dir) return bin;
  }
};
const eslintBin = flag("--eslint-bin") ?? nearestBin("eslint");
const config = flag("--config");
const targets = args.length ? args : ["."];

const env = { ...process.env, AGENT_RULES_STRICT: "1", NO_COLOR: "1", FORCE_COLOR: "0" };
const res = spawnSync(eslintBin, ["--format", "json", "--no-cache", "--no-warn-ignored", ...(config ? ["--config", config] : []), ...targets], {
  encoding: "utf8", env, maxBuffer: 512 * 1024 * 1024,
});
let results;
try {
  results = JSON.parse(res.stdout);
} catch {
  console.error(`count-by-group: ESLint produced no JSON (exit ${res.status})\n${res.stderr.slice(0, 500)}`);
  process.exit(2);
}

const count = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n);
const byGroup = new Map();
const byDetail = new Map();
const outside = new Map();
let warnings = 0;
for (const r of results) {
  for (const m of r.messages) {
    if (m.severity !== 2) {
      warnings += 1;
      continue;
    }
    const group = groupOf(m.ruleId);
    if (!group) {
      count(outside, m.ruleId ?? "parse error");
      continue;
    }
    count(byGroup, group);
    count(byDetail, `${group}: ${m.ruleId}${messageId(m.message) ? ` ${messageId(m.message)}` : ""}`);
  }
}

const withFindings = GROUPS.filter((g) => byGroup.get(g));
const stylelintBin = path.join(process.cwd(), "node_modules", ".bin", "stylelint");
let css = null;
if (fs.existsSync(stylelintBin) && !config) {
  const s = spawnSync(stylelintBin, ["--formatter", "json", "**/*.css"], { encoding: "utf8", env, maxBuffer: 128 * 1024 * 1024 });
  try {
    css = JSON.parse(s.stdout || s.stderr).flatMap((r) => r.warnings).filter((w) => w.severity === "error").length;
  } catch {
    css = null;
  }
}

const out = {
  groups: Object.fromEntries(GROUPS.map((g) => [g, byGroup.get(g) ?? 0])),
  details: Object.fromEntries([...byDetail].sort((a, b) => b[1] - a[1])),
  errorsOutsideGroups: Object.fromEntries(outside),
  warningsAtFixedLevel: warnings,
  stylelint: css,
  legacy: Object.fromEntries(withFindings.map((g) => [g, true])),
};
if (json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log("group        findings (as errors)");
  for (const g of GROUPS) console.log(`${g.padEnd(12)} ${byGroup.get(g) ?? 0}`);
  console.log("\nper rule:");
  for (const [k, v] of [...byDetail].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
  if (outside.size) console.log(`\nerrors outside the groups (always errors, fix first): ${[...outside].map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`warnings at a fixed level (smoke detectors, jsx-a11y, unused vars; counted by CI): ${warnings}`);
  if (css !== null) console.log(`Stylelint findings (strict): ${css}`);
  const zero = GROUPS.filter((g) => !byGroup.get(g));
  console.log(`\nlegacy: ${JSON.stringify(out.legacy)}`);
  console.log(zero.length ? `groups with zero findings, strict from now on: ${zero.join(", ")}` : "every group still has findings");
}
