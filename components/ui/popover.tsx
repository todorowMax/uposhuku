"use client";

// shadcn/ui Popover (Radix), закастомлений під наш дизайн: та сама біла
// картка з тінню й радіусом, що в випадайки Select. Стилі: .ui-popover у globals.css.

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

// Поповер живе в порталі на <body>, поза модальним Dialog, тож блокування прокрутки (react-remove-scroll) гасить
// wheel і touchmove на ньому, і список усередині не гортається. Події не піднімаємо до документа, де їх ловить блокування.
const keepScroll = (event: React.SyntheticEvent) => event.stopPropagation();

const PopoverContent = ({ className, align = "start", sideOffset = 8, onWheel, onTouchMove, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) => {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn("ui-popover", className)}
        onWheel={(event) => {
          onWheel?.(event);
          keepScroll(event);
        }}
        onTouchMove={(event) => {
          onTouchMove?.(event);
          keepScroll(event);
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
};

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
