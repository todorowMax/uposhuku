"use client";

// components/ui/clamped-text.tsx
//
// Довгий текст людини: до трьох рядків із «…», довгі слова без пробілів переносяться, «Показати більше» зʼявляється
// лише тоді, коли текст справді обрізано. `className` дає лише розкладку й вигляд тексту.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsClamped } from "@/lib/ui/use-is-clamped";
import { cn } from "@/lib/utils";

export namespace ClampedTextTypes {
  export type Props = {
    text: string;
    className?: string;
    /** Підпис кнопки розгортання; типово «Показати більше». */
    moreLabel?: string;
  };
}

export const ClampedText = ({ text, className, moreLabel = "Показати більше" }: ClampedTextTypes.Props) => {
  const [expanded, setExpanded] = useState(false);
  const { ref, clamped } = useIsClamped(text, expanded);

  return (
    <>
      <p ref={ref} className={cn("wrap-anywhere whitespace-pre-wrap", !expanded && "line-clamp-3", className)}>
        {text}
      </p>
      {(clamped || expanded) && (
        <Button variant="link" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="ml-2 h-auto p-0 text-xs">
          {expanded ? "Згорнути" : moreLabel}
        </Button>
      )}
    </>
  );
};
