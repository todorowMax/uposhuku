#!/usr/bin/env node
// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Pre-commit check: strict ESLint and Stylelint on the STAGED files, errors only on the lines staged
// for commit (git diff --cached -U0). Old lines stay warnings under the CI ratchet; new code is held
// to errors. Zero dependencies. Run from the project root (lefthook does).
//
// A file with unstaged edits is linted from its staged content (git show :file through --stdin), so
// line numbers match what the diff says. Exit 1 on any error, 0 otherwise (also when no linter is
// installed: that is reported, not failed).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { changedRanges, inRanges } from "../src/diff-lines.mjs";

const CODE = /\.(ts|tsx|js|jsx|mjs)$/;
const CSS = /\.css$/;
const STRICT = { ...process.env, AGENT_RULES_STRICT: "1", FORCE_COLOR: "0", NO_COLOR: "1" };

const run = (cmd, args, input) =>
  spawnSync(cmd, args, { encoding: "utf8", env: STRICT, input, maxBuffer: 64 * 1024 * 1024 });

const parseJson = (...texts) => {
  for (const t of texts) {
    try {
      return JSON.parse(t);
    } catch {
      // try the next stream
    }
  }
  return null;
};

const stagedFiles = () =>
  run("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--relative", "-z"]).stdout.split("\0").filter(Boolean);

const hasUnstagedEdits = (file) => run("git", ["diff", "--quiet", "--", file]).status === 1;

// The nearest node_modules/.bin/<name> from the working directory upwards, so a workspace of a
// monorepo (the hook runs inside it) finds the linters hoisted to the repository root.
const localBin = (name) => {
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const bin = path.join(dir, "node_modules", ".bin", name);
    if (fs.existsSync(bin)) return bin;
    if (path.dirname(dir) === dir) return null;
  }
};

// Linters report differently; each adapter returns [{ file, line, column, rule, message }] errors.
const eslintErrors = (json) =>
  json.flatMap((r) => r.messages.filter((m) => m.severity === 2).map((m) => ({ file: r.filePath, line: m.line ?? 0, column: m.column ?? 0, rule: m.ruleId ?? "parse error", message: m.message, fatal: !m.ruleId })));
const stylelintErrors = (json) =>
  json.flatMap((r) => (r.warnings ?? []).filter((w) => w.severity === "error").map((w) => ({ file: r.source, line: w.line ?? 0, column: w.column ?? 0, rule: w.rule ?? "syntax", message: w.text.replace(/\s*\([^()]*\)$/, ""), fatal: !w.rule })));

const TOOLS = {
  eslint: { match: CODE, args: ["--no-warn-ignored", "--format", "json"], stdin: (f) => ["--stdin", "--stdin-filename", f], adapt: eslintErrors },
  stylelint: { match: CSS, args: ["--formatter", "json"], stdin: (f) => ["--stdin", "--stdin-filename", f], adapt: stylelintErrors },
};

const lintWith = (name, files) => {
  const tool = TOOLS[name];
  const mine = files.filter((f) => tool.match.test(f));
  if (!mine.length) return [];
  const bin = localBin(name);
  if (!bin) {
    console.error(`lint-staged-strict: no local ${name}, skipped ${mine.length} file(s)`);
    return [];
  }
  const clean = mine.filter((f) => !hasUnstagedEdits(f));
  const dirty = mine.filter((f) => hasUnstagedEdits(f));
  const results = [];
  if (clean.length) {
    const res = run(bin, [...tool.args, ...clean]);
    results.push(...(tool.adapt(parseJson(res.stdout, res.stderr) ?? [])));
  }
  for (const f of dirty) {
    const staged = run("git", ["show", `:${f}`]).stdout;
    const res = run(bin, [...tool.args, ...tool.stdin(f)], staged);
    results.push(...tool.adapt(parseJson(res.stdout, res.stderr) ?? []).map((e) => ({ ...e, file: path.resolve(f) })));
  }
  return results;
};

const main = () => {
  const files = stagedFiles();
  const errors = ["eslint", "stylelint"].flatMap((name) => lintWith(name, files));
  const kept = errors.filter((e) => e.fatal || inRanges(e.line, changedRanges(path.resolve(e.file), { staged: true })));
  for (const e of kept) console.error(`${path.relative(process.cwd(), e.file)}:${e.line}:${e.column} ${e.rule}: ${e.message}`);
  if (kept.length) console.error(`\nlint-staged-strict: ${kept.length} error(s) on staged lines. Fix them (old lines elsewhere in these files are not checked here).`);
  return kept.length ? 1 : 0;
};

process.exitCode = main();
