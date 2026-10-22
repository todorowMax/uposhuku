// agent-rules lint 1.0.0: vendored copy, do not edit; update with agent-rules/scripts/sync.mjs --apply
// no-restricted-imports configurations.

// COMP-7: all new animation is GSAP (Flip, ScrollTrigger).
const MOTION_MESSAGE = "COMP-7: animation is GSAP only (Flip, ScrollTrigger); no motion or framer-motion.";

export const motionPatterns = [
  { group: ["motion", "motion/*", "framer-motion", "framer-motion/*"], message: MOTION_MESSAGE },
];

// COMP-1: pages and layouts compose; state lives in the component's own use-*.ts hook.
export const pageStatePaths = [
  {
    name: "react",
    importNames: ["useState", "useEffect", "useLayoutEffect", "useReducer"],
    message: "COMP-1: move client state into a component and its use-*.ts hook.",
  },
];
