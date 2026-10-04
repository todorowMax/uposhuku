"use client";

import { motion, useAnimation, type SVGMotionProps } from "motion/react";
import { useRef } from "react";
import { useButtonIconAnimation } from "./use-button-icon-animation";

/** Rating star, matching the animated icon set where no star is published. */
export function Star(props: SVGMotionProps<SVGSVGElement>) {
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
      variants={{ normal: { scale: 1, rotate: 0 }, animate: { scale: 1.12, rotate: -8, transition: { duration: 0.24 } } }}
      {...props}
    >
      <path d="m12 2 3.09 6.26 6.91 1.01-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2Z" />
    </motion.svg>
  );
}
