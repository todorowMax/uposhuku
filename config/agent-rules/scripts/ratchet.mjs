#!/usr/bin/env node
// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Self-tightening warning ratchet. Reads the `--max-warnings N` baselines from the `lint:ci` script
// in package.json, counts the warnings the way `lint:ci` does (same ESLint and Stylelint commands,
// same arguments, JSON output) and compares.
// Zero dependencies. Run from the project root (in a monorepo: from the workspace folder).
//
//   node config/agent-rules/scripts/ratchet.mjs --check     exit 1 when a count is above its baseline
//   node config/agent-rules/scripts/ratchet.mjs --update    write lower baselines into package.json; never raises
//   ... --update --stage                                    also `git add package.json` after writing (pre-commit hook)
//   node config/agent-rules/scripts/ratchet.mjs             report only
//
// Exit codes: 0 fine, 1 a count is above its baseline (--check), 2 the counts could not be measured
// (--check). --update never fails a commit: when it cannot measure it says so and exits 0 without
// writing, and a count above its baseline is left for --check and CI to report.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { lowered, parseLintCi, rewritePackage, rewriteScript } from "../src/ratchet-baseline.mjs";

const mode = process.argv.includes("--update") ? "update" : process.argv.includes("--check") ? "check" : "report";
const stage = process.argv.includes("--stage");
const PACKAGE = path.join(process.cwd(), "package.json");

const nearestBin = (name) => {
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const bin = path.join(dir, "node_modules", ".bin", name);
    if (fs.existsSync(bin)) return bin;
    if (path.dirname(dir) === dir) return null;
  }
};

const runJson = (tool, args) => {
  const bin = nearestBin(tool);
  if (!bin) return { error: `${tool} is not installed (no node_modules/.bin/${tool} above ${process.cwd()})` };
  const format = tool === "eslint" ? ["--format", "json"] : ["--formatter", "json"];
  const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
  const res = spawnSync(bin, [...args, ...format], { encoding: "utf8", env, maxBuffer: 512 * 1024 * 1024 });
  try {
    return { results: JSON.parse(res.stdout.trim() || res.stderr.trim()) };
  } catch {
    return { error: `${tool} produced no JSON (exit ${res.status}): ${(res.stderr || res.stdout).slice(0, 300)}` };
  }
};

// { warnings, errors, files } from a linter's JSON; ESLint: results[].messages, Stylelint: results[].warnings.
const tally = (tool, results) => {
  let warnings = 0;
  let errors = 0;
  for (const r of results) {
    for (const m of tool === "eslint" ? r.messages : r.warnings) {
      const level = tool === "eslint" ? (m.severity === 2 ? "error" : "warning") : m.severity;
      if (level === "error") errors += 1;
      else warnings += 1;
    }
  }
  return { warnings, errors, files: results.length };
};

const measure = (tools) => {
  const counts = {};
  for (const [tool, { args }] of Object.entries(tools)) {
    const run = runJson(tool, args);
    if (run.error) return { error: run.error };
    const t = tally(tool, run.results);
    // A run that linted no file at all is a broken config or glob, not a clean project.
    if (t.files === 0) return { error: `${tool} linted no files; check the arguments of lint:ci` };
    counts[tool] = t;
  }
  return { counts };
};

const unstagedChanges = () => {
  const res = spawnSync("git", ["diff", "--quiet", "--", PACKAGE], { cwd: process.cwd() });
  return res.status === 1;
};

const fail = (message, code) => {
  console.error(`ratchet: ${message}`);
  process.exit(mode === "update" ? 0 : code);
};

const report = (tools, counts) => {
  for (const [tool, { baseline }] of Object.entries(tools)) {
    const { warnings, errors } = counts[tool];
    const verdict = warnings > baseline ? "ABOVE baseline" : warnings < baseline ? "below baseline, can be lowered" : "at baseline";
    console.log(`ratchet: ${tool} ${warnings} warnings (baseline ${baseline}) ${verdict}${errors ? `; ${errors} errors (lint:ci fails on those)` : ""}`);
  }
};

const update = (raw, script, tools, counts) => {
  const next = lowered(tools, Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.warnings])));
  const changed = Object.keys(tools).filter((k) => next[k] !== tools[k].baseline);
  if (!changed.length) return console.log("ratchet: nothing to lower");
  if (unstagedChanges()) return console.log("ratchet: package.json has unstaged changes, not touching it; commit them and run --update again");
  const text = rewritePackage(raw, script, rewriteScript(script, next));
  if (!text) return console.log("ratchet: lint:ci was not found exactly once in package.json, not touching it");
  fs.writeFileSync(`${PACKAGE}.ratchet.tmp`, text);
  fs.renameSync(`${PACKAGE}.ratchet.tmp`, PACKAGE);
  for (const k of changed) console.log(`ratchet: lowered ${k} baseline ${tools[k].baseline} -> ${next[k]}`);
  if (stage && spawnSync("git", ["add", "--", PACKAGE], { cwd: process.cwd() }).status !== 0) console.log("ratchet: could not stage package.json; add it yourself");
};

const main = () => {
  if (!fs.existsSync(PACKAGE)) return fail(`no package.json in ${process.cwd()}`, 2);
  const raw = fs.readFileSync(PACKAGE, "utf8");
  const script = JSON.parse(raw).scripts?.["lint:ci"];
  const tools = parseLintCi(script);
  if (!Object.keys(tools).length) return fail('no "--max-warnings N" baseline found in the lint:ci script', 2);
  const { counts, error } = measure(tools);
  if (error) return fail(error, 2);
  report(tools, counts);
  if (mode === "update") return update(raw, script, tools, counts);
  const above = Object.keys(tools).filter((k) => counts[k].warnings > tools[k].baseline);
  if (mode === "check" && above.length) {
    console.error(`ratchet: ${above.join(", ")} above the baseline; fix the new warnings, never raise the number`);
    process.exit(1);
  }
};

main();
