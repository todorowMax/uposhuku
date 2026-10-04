"use client";

import { motion, useAnimation, type SVGMotionProps } from "motion/react";
import { useRef } from "react";
import { useButtonIconAnimation } from "./use-button-icon-animation";

/** QR symbol, matching the animated icon set where no QR icon is published. */
export function QrCode(props: SVGMotionProps<SVGSVGElement>) {
  const ref = useRef<SVGSVGElement>(null);
  const controls = useAnimation();
  useButtonIconAnimation(controls, ref);
  return (
    <motion.svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      animate={controls}
      variants={{ normal: { scale: 1 }, animate: { scale: 1.1, transition: { duration: 0.24 } } }}
      {...props}
    >
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="15" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="15" width="7" height="7" rx="1" />
      <path d="M5 5h1m12 0h1M5 18h1m9-3h2v2h-2zm5 0v3h-2m-4 2h2m2 0h2v-2" />
    </motion.svg>
  );
}
