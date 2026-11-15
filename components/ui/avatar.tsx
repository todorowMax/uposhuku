"use client";

// shadcn/ui Avatar (Radix) під наш дизайн: коло з фото, а поки фото немає чи воно не завантажилось, ініціали.
// Стилі: .ui-avatar у globals.css. Декоративний: ім'я людини поруч уже є текстом.

import type * as React from "react";
import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export namespace AvatarTypes {
  export type Props = Omit<React.ComponentProps<typeof AvatarPrimitive.Root>, "children"> & { src?: string; initials: string };
}

const Avatar = ({ src, initials, className, ...props }: AvatarTypes.Props) => (
  <AvatarPrimitive.Root data-slot="avatar" aria-hidden className={cn("ui-avatar", className)} {...props}>
    {src && <AvatarPrimitive.Image src={src} alt="" className="ui-avatar-image" />}
    <AvatarPrimitive.Fallback className="ui-avatar-fallback">{initials}</AvatarPrimitive.Fallback>
  </AvatarPrimitive.Root>
);

export { Avatar };
