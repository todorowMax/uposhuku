// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// @next/eslint-plugin-next 15 exposes the flat core-web-vitals config as `flatConfig.coreWebVitals`;
// version 16 dropped that object and ships the flat config as `configs["core-web-vitals"]`.
export const coreWebVitals = (plugin) => plugin.flatConfig?.coreWebVitals ?? plugin.configs["core-web-vitals"];
