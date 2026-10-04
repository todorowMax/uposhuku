"use client";

import { motion, useAnimation, type SVGMotionProps } from "motion/react";
import { useRef } from "react";
import { useButtonIconAnimation } from "./use-button-icon-animation";

export function Eraser(props: SVGMotionProps<SVGSVGElement>) {
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
      variants={{ normal: { x: 0, rotate: 0 }, animate: { x: [0, -2, 2, 0], rotate: [0, -7, 7, 0], transition: { duration: 0.45 } } }}
      {...props}
    >
      <path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4L13.3 2.7a2.4 2.4 0 0 1 3.4 0l4.6 4.6a2.4 2.4 0 0 1 0 3.4L11 21H7Z" />
      <path d="m5 11 8 8M11 21h10" />
    </motion.svg>
  );
}
