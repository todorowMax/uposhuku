"use client";

// components/account/account-menu.tsx
//
// Меню акаунта (DESIGN.md, «Шари»): від 768 px випадайка над кружечком, на телефоні шторка знизу, бо пальцем
// у вузьке меню влучати важко. Пункти спільні (`use-account-menu.ts`). Пункт, що відкриває екран, спершу закриває шторку.

import { useState } from "react";
import { useAccountMenu, type AccountMenuTypes } from "@/components/account/use-account-menu";
import { Button } from "@/components/ui/button";
import { refreshFees } from "@/lib/fees/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { openAfterLayers } from "@/lib/ui/use-layer-history";
import { useMediaQuery } from "@/lib/ui/use-media-query";

export namespace AccountMenuScreenTypes {
  export type Props = {
    initial: string;
    name: string | null;
    email: string;
  };
}

const Note = ({ item }: { item: AccountMenuTypes.Item }) =>
  item.note !== undefined && <span className="ml-auto text-xs text-ink-muted">{item.note}</span>;

export const AccountMenu = ({ initial, name, email }: AccountMenuScreenTypes.Props) => {
  const items = useAccountMenu();
  const desktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const trigger = (
    <Button variant="bare" aria-label={`Акаунт ${email}`} className="account-avatar">
      {initial}
    </Button>
  );
  const who = (
    <>
      {name && <p className="truncate text-sm font-semibold text-ink">{name}</p>}
      <p className="truncate text-xs text-ink-muted">{email}</p>
    </>
  );

  if (desktop) {
    return (
      <DropdownMenu onOpenChange={(next) => next && void refreshFees()}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="account-menu">
          <div className="px-3 pb-2 pt-1">{who}</div>
          {items.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={item.run} disabled={item.disabled}>
              {item.icon}
              {item.label}
              <Note item={item} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refreshFees();
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <SheetTitle className="ui-sheet-title">Акаунт</SheetTitle>
        <SheetDescription className="sr-only">Профіль, запити, сповіщення, дані й вихід.</SheetDescription>
        <SheetBody className="grid gap-1">
          <div className="px-3 pb-2">{who}</div>
          {items.map((item) => (
            <Button
              key={item.id}
              variant="bare"
              className="account-menu-item min-h-12 w-full"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                openAfterLayers(item.run);
              }}
            >
              {item.icon}
              {item.label}
              <Note item={item} />
            </Button>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};
