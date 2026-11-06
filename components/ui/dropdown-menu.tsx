"use client";

// shadcn/ui DropdownMenu (Radix), закастомлений під наш дизайн: біла картка з тінню,
// пункти на всю ширину. Стрілки, Home/End, набір літер, Esc і повернення фокуса на кнопку
// дає Radix. Стилі: .ui-dropdown, .account-menu-item у globals.css.

import type * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuContent = ({ className, align = "center", sideOffset = 8, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) => {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content data-slot="dropdown-menu-content" align={align} sideOffset={sideOffset} collisionPadding={12} className={cn("ui-dropdown", className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
};

const DropdownMenuItem = ({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) => {
  return <DropdownMenuPrimitive.Item data-slot="dropdown-menu-item" className={cn("account-menu-item", className)} {...props} />;
};

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger };
