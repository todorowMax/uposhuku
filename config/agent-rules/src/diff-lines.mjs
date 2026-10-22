// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Changed-line detection for "strict on changed lines": new code is held to errors, old lines stay
// warnings under the CI ratchet. Zero dependencies (Node built-ins and the git binary).
// Used by hooks/lint-on-edit.mjs (against HEAD) and scripts/lint-staged-strict.mjs (against the index).
import { spawnSync } from "node:child_process";
import path from "node:path";

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

// Line ranges [from, to] that a `git diff -U0` shows as added or changed in the new version.
export const parseHunks = (diff) =>
  diff.split("\n").flatMap((line) => {
    const m = line.match(HUNK);
    if (!m) return [];
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    return count > 0 ? [[start, start + count - 1]] : [];
  });

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// null means "all lines": not a git repo, no commits yet, or an untracked file. [] means unchanged.
export const changedRanges = (file, { staged = false } = {}) => {
  const cwd = path.dirname(file);
  if (git(["rev-parse", "--is-inside-work-tree"], cwd).status !== 0) return null;
  const base = ["diff", "--no-color", "--no-ext-diff", "-U0"];
  if (staged) {
    const res = git([...base, "--cached", "--", file], cwd);
    return res.status === 0 ? parseHunks(res.stdout) : null;
  }
  if (git(["ls-files", "--error-unmatch", "--", file], cwd).status !== 0) return null;
  const res = git([...base, "HEAD", "--", file], cwd);
  return res.status === 0 ? parseHunks(res.stdout) : null;
};

export const inRanges = (line, ranges) => ranges === null || ranges.some(([from, to]) => line >= from && line <= to);
