// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// Flat-config blocks, one function per concern. eslint.mjs composes them.
import nextPlugin from "@next/eslint-plugin-next";
import checkFile from "eslint-plugin-check-file";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { motionPatterns, pageStatePaths, yupPaths } from "./imports.mjs";
import { coreWebVitals } from "./next-plugin.mjs";
import { severityFor } from "./options.mjs";
import * as selectors from "./selectors.mjs";

export const TS_FILES = ["**/*.{ts,tsx,mts,cts}"];
export const JS_FILES = ["**/*.{js,jsx,mjs,cjs}"];
export const CODE_FILES = [...TS_FILES, ...JS_FILES];

const IGNORES = [
  ".next/**", ".open-next/**", ".wrangler/**", ".claude/**", ".agents/**", "node_modules/**", "public/**",
  "coverage/**", "test-results/**", "playwright-report/**", "next-env.d.ts", "cloudflare-env.d.ts",
  "config/agent-rules/**",
];

const sources = (dir) => [`${dir}/**/*.{ts,tsx}`];
const restricted = (severity, ...groups) => ({
  "no-restricted-syntax": [severity, ...groups.flat()],
});

export const ignoreBlock = (o) => ({ ignores: [...IGNORES, ...o.ignores] });

// Next.js rules and the jsx-a11y set that eslint-config-next enables (DS-7, FORM-4).
export const nextBlocks = () => [
  coreWebVitals(nextPlugin),
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },
];

// TypeScript parser and the recommended set for TS files; a JS parser with JSX for JS files.
export const parserBlocks = (o) => {
  const tsWarn = severityFor(o.legacy, "types") === "warn";
  const recommended = tseslint.configs.recommended.map((c) => ({
    ...c,
    files: TS_FILES,
    ...(c.rules && tsWarn
      ? { rules: Object.fromEntries(Object.entries(c.rules).map(([k, v]) => [k, v === "error" || v === 2 ? "warn" : v])) }
      : {}),
  }));
  return [
    ...recommended,
    {
      files: ["**/*.{jsx,mjs,js,cjs}"],
      languageOptions: { sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
    },
  ];
};

// Rules for every code file.
export const codeRules = (o) => ({
  files: CODE_FILES,
  plugins: { sonarjs },
  rules: {
    // COMP-15, ARCH-11: one function form, early returns.
    "func-style": [severityFor(o.legacy, "style"), "expression"],
    "prefer-arrow-callback": severityFor(o.legacy, "style"),
    "no-else-return": severityFor(o.legacy, "style"),
    // ARCH-7, ARCH-11, ARCH-12, COMP-3: smoke detectors; a hit means check the responsibility (ARCH-1).
    "sonarjs/cognitive-complexity": ["warn", 15],
    "max-depth": ["warn", 3],
    "max-params": ["warn", 3],
    "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
    // COMP-7: no motion or framer-motion imports.
    // FORM-3: yup only in validation/ and tests (the override block follows in yupAllowedBlock).
    "no-restricted-imports": [severityFor(o.legacy, "imports"), { patterns: motionPatterns, paths: yupPaths }],
    // ARCH-9 everywhere; the product, ui, e2e blocks below repeat it with their own groups.
    ...restricted(severityFor(o.legacy, "syntax"), selectors.classInheritance),
  },
});

const levelOf = (v) => (v === 2 || v === "error" ? "error" : v === 1 || v === "warn" ? "warn" : "off");
const mapLevels = (rules, fn) =>
  Object.fromEntries(Object.entries(rules).map(([k, v]) => (Array.isArray(v) ? [k, [fn(levelOf(v[0])), ...v.slice(1)]] : [k, fn(levelOf(v))])));
// Baseline hygiene (what eslint-config-next gave): errors become warnings in legacy mode.
const hygieneLevel = (o) => (level) => (level === "error" && severityFor(o.legacy, "hygiene") === "warn" ? "warn" : level);

// COMP-12 and the full react-hooks recommended preset (v7, includes the React Compiler rules).
// rules-of-hooks is an error even in legacy mode.
export const hooksBlock = (o) => ({
  files: CODE_FILES,
  plugins: { "react-hooks": reactHooks },
  rules: {
    ...mapLevels(reactHooks.configs.flat["recommended-latest"].rules, hygieneLevel(o)),
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
});

// eslint-plugin-react recommended + jsx-runtime (jsx-key, no-unescaped-entities, display-name,
// jsx-no-target-blank, ...) and import/no-anonymous-default-export, as in eslint-config-next.
export const reactBlocks = (o) => {
  const files = ["**/*.{jsx,tsx}"];
  const { recommended, "jsx-runtime": runtime } = reactPlugin.configs.flat;
  const level = hygieneLevel(o);
  return [
    { ...recommended, files, settings: { react: { version: "detect" } }, rules: mapLevels(recommended.rules, level) },
    { ...runtime, files, rules: mapLevels(runtime.rules, level) },
    { files, rules: { "react/no-unknown-property": "off", "react/prop-types": "off" } },
    {
      files: CODE_FILES,
      plugins: { import: importPlugin },
      rules: { "import/no-anonymous-default-export": level("error") },
    },
  ];
};

// Rules for TypeScript files.
export const typescriptRules = (o) => ({
  files: TS_FILES,
  rules: {
    // COMP-10, COMP-17: no any, type-only imports. COMP-18: namespaces hold types only; the
    // tsconfig fragment sets erasableSyntaxOnly, so the recommended no-namespace is off.
    "@typescript-eslint/no-explicit-any": severityFor(o.legacy, "types"),
    "@typescript-eslint/consistent-type-imports": severityFor(o.legacy, "types"),
    "@typescript-eslint/no-namespace": "off",
    // ARCH-8: unused code; a leading underscore marks a deliberately unused name.
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
  },
});

// DS-2, DS-5, CSS-2, CSS-4, TW-3, ARCH-5: product code. Primitives (uiDir) may hold native
// controls; they still obey the value rules.
export const productBlocks = (o) => {
  const sev = severityFor(o.legacy, "syntax");
  const product = o.productDirs ?? [o.appDir, o.componentsDir];
  const components = sources(o.componentsDir);
  const ui = sources(o.uiDir);
  return [
    {
      files: product.flatMap(sources),
      ignores: ui,
      rules: restricted(sev, selectors.classInheritance, selectors.nativeControls, selectors.presentational),
    },
    {
      files: components,
      ignores: [...ui, `${o.componentsDir}/**/use-*.{ts,tsx}`],
      rules: restricted(
        sev,
        selectors.classInheritance,
        selectors.nativeControls,
        selectors.presentational,
        selectors.fetchInComponents,
      ),
    },
    { files: ui, rules: restricted(sev, selectors.classInheritance, selectors.presentational) },
  ];
};

// COMP-1: no state hooks in pages and layouts.
export const pageBlock = (o) => ({
  files: [`${o.appDir}/**/page.{ts,tsx}`, `${o.appDir}/**/layout.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      severityFor(o.legacy, "imports"),
      { patterns: motionPatterns, paths: [...pageStatePaths, ...yupPaths] },
    ],
  },
});

// FORM-3: validation/ folders and tests may import yup; the other import rules stay.
export const yupAllowedBlock = (o) => ({
  files: ["**/validation/**/*.{ts,tsx}", `${o.testsDir}/**/*.{ts,tsx,js,jsx,mjs}`, "**/*.{test,spec}.{ts,tsx}"],
  rules: { "no-restricted-imports": [severityFor(o.legacy, "imports"), { patterns: motionPatterns }] },
});

// TEST-1: e2e locators.
export const e2eBlock = (o) => ({
  files: [`${o.testsDir}/e2e/**/*.{ts,tsx}`],
  rules: restricted(severityFor(o.legacy, "syntax"), selectors.classInheritance, selectors.e2eLocators),
});

// Tests render raw anchors on purpose (tap feedback, link wrappers), so the Next rule that wants
// next/link for internal pages is off in test files: the testsDir tree and *.test / *.spec files.
export const testFileBlock = (o) => ({
  files: [`${o.testsDir}/**/*.{ts,tsx,js,jsx,mjs}`, "**/*.{test,spec}.{ts,tsx}"],
  rules: { "@next/next/no-html-link-for-pages": "off" },
});

// COMP-4, decision 24: kebab-case file names (`use-foo.ts`, `foo.types.ts`, `foo.test.ts`).
export const fileNameBlock = (o) => ({
  files: CODE_FILES,
  plugins: { "check-file": checkFile },
  rules: {
    "check-file/filename-naming-convention": [
      severityFor(o.legacy, "fileNames"),
      { "**/*.{ts,tsx,js,jsx,mjs,mts}": "KEBAB_CASE" },
      { ignoreMiddleExtensions: true },
    ],
  },
});

// CF-6: needs type information, so it is opt-in (`typed: true`) and slower.
export const typedBlock = (o) => ({
  files: TS_FILES,
  languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: o.tsconfigRootDir } },
  rules: { "@typescript-eslint/no-floating-promises": severityFor(o.legacy, "floating") },
});
