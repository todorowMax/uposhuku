"use client";

import { motion, useAnimation, type SVGMotionProps } from "motion/react";
import { useRef } from "react";
import { useButtonIconAnimation } from "./use-button-icon-animation";

export function Scale(props: SVGMotionProps<SVGSVGElement>) {
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
      variants={{ normal: { rotate: 0 }, animate: { rotate: [0, -5, 5, 0], transition: { duration: 0.55 } } }}
      {...props}
    >
      <path d="m16 16 3-8 3 8c-.8 1.2-2 2-3 2s-2.2-.8-3-2ZM2 16l3-8 3 8c-.8 1.2-2 2-3 2s-2.2-.8-3-2Z" />
      <path d="M7 21h10M12 3v18M3 7h18" />
    </motion.svg>
  );
}
