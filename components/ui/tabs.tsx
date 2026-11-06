"use client";

// shadcn/ui Tabs (Radix) під наш дизайн: рядок вкладок із прокруткою на вузькому екрані, активна вкладка
// підсвічена, стрілки й фокус дає Radix. Стилі: .ui-tabs-* у globals.css.

import type * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const Tabs = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) => <TabsPrimitive.Root data-slot="tabs" className={cn("ui-tabs", className)} {...props} />;

const TabsList = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) => <TabsPrimitive.List data-slot="tabs-list" className={cn("ui-tabs-list", className)} {...props} />;

const TabsTrigger = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) => <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn("ui-tabs-trigger", className)} {...props} />;

const TabsContent = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) => <TabsPrimitive.Content data-slot="tabs-content" className={cn("ui-tabs-content", className)} {...props} />;

export { Tabs, TabsContent, TabsList, TabsTrigger };
