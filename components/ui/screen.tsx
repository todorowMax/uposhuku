"use client";

// components/ui/screen.tsx
//
// «Екран» з DESIGN.md (розділ «Шари»): шар, де людина затримується, читає, вводить кілька полів, платить.
// Radix Dialog, тож фокус, Escape, повернення фокусу й прокрутка сторінки під ним беруться з нього.
//
//   до 768 px: на весь екран, заїжджає справа наліво; шапка «←» і заголовок, одна прокручувана середина,
//              закріплений низ; відступи safe-area; низ і поле у фокусі над клавіатурою;
//   від 768 px: desktop="panel" — панель шириною з чат, без затемнення (`lib/ui/chat-window.ts`):
//                - від 1100 px з відкритим чатом це одне вікно «угода + чат»: панель упритул ліворуч, спільна тінь
//                  і заокруглення по зовнішньому контуру, лінія між ними; у шапці «×» лише для панелі, чат поруч робочий;
//                - вужче 1100 px панель лягає на чат, у шапці «← До чату» (закриває лише панель);
//                - без чату панель одна справа, у шапці «←»;
//              desktop="dialog" — вікно по центру із затемненням;
//              width="wide" робить таке вікно ширшим (форма з переглядом збоку, карта).
//
// Системне «назад» закриває верхній шар (`useLayerHistory`). Виклик той самий на всіх екранах:
//
//   <Screen open={open} onOpenChange={setOpen} title="Угода" desktop="panel" footer={<Button className="w-full">Оплатити</Button>}>
//     …вміст…
//   </Screen>

import * as React from "react";
import { Dialog as ScreenPrimitive } from "radix-ui";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { bumpPanels, chatOpenStore, DOCK_QUERY, screenDock } from "@/lib/ui/chat-window";
import { useDockTabFlow } from "@/lib/ui/use-dock-tab-flow";
import { useFocusIntoView } from "@/lib/ui/use-focus-into-view";
import { useKeepFocus } from "@/lib/ui/use-keep-focus";
import { useKeyboardInset } from "@/lib/ui/use-keyboard-inset";
import { useLayerHistory } from "@/lib/ui/use-layer-history";
import { useMediaQuery } from "@/lib/ui/use-media-query";

export namespace ScreenTypes {
  export type Desktop = "panel" | "dialog";
  export type Width = "default" | "wide";
  export type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Заголовок у шапці; він же імʼя діалогу для скрінрідера. */
    title: string;
    /** Необовʼязковий опис для скрінрідера (на екрані не показується). */
    description?: string;
    /** Вид від 768 px: панель біля чату або вікно по центру. */
    desktop?: Desktop;
    /** Ширина вікна по центру від 768 px; для `panel` не діє. */
    width?: Width;
    /** Дія справа в шапці (одна кнопка або меню). */
    action?: React.ReactNode;
    /** Закріплений низ з головною кнопкою; без нього низу немає. */
    footer?: React.ReactNode;
    children: React.ReactNode;
  };
}

const DESKTOP = "(min-width: 768px)";

const Screen = ({ open, onOpenChange, title, description, desktop = "dialog", width = "default", action, footer, children }: ScreenTypes.Props) => {
  // Вузли в стані, не в ref: Radix монтує вміст пізніше за перший ефект.
  const [content, setContent] = React.useState<HTMLDivElement | null>(null);
  const [body, setBody] = React.useState<HTMLDivElement | null>(null);
  const wide = useMediaQuery(DESKTOP);
  const roomy = useMediaQuery(DOCK_QUERY);
  const chatOpen = useStore(chatOpenStore);
  const dock = screenDock({ desktop, wide, roomy, chatOpen });
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  useLayerHistory(open, close);
  useKeyboardInset(content, open);
  useFocusIntoView(body, open);
  useKeepFocus(content, open);
  useDockTabFlow(content, open && dock === "docked");
  // Відкрита панель каже чату (use-inbox), що розгорнутому вікну треба стиснутись, щоб панель стала поруч.
  const counted = open && dock !== "full";
  React.useEffect(() => {
    if (!counted) return;
    bumpPanels(1);
    return () => bumpPanels(-1);
  }, [counted]);
  // Панель поруч із чатом (або сама) не блокує сторінку: чат лишається робочим. Екран, вікно й панель, що лягла
  // на чат, модальні: інакше Tab ішов би в чат під нею.
  const modal = dock === "full" || dock === "overlay";
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      <ScreenPrimitive.Portal>
        <ScreenPrimitive.Overlay className="ui-screen-scrim" data-desktop={desktop} />
        <DialogContent
          ref={setContent}
          variant="panel"
          className="ui-screen"
          data-desktop={desktop}
          data-width={width}
          data-chat={chatOpen ? "open" : "closed"}
          {...(description ? {} : { "aria-describedby": undefined })}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="ui-screen-header">
            {dock === "docked" ? null : (
              <DialogClose asChild>
                {dock === "overlay" ? (
                  <Button variant="quiet" className="-ml-2">
                    <ArrowLeft className="size-4" aria-hidden />
                    До чату
                  </Button>
                ) : (
                  <Button variant="icon" aria-label="Назад">
                    <ArrowLeft className="size-5" aria-hidden />
                  </Button>
                )}
              </DialogClose>
            )}
            <DialogTitle className="ui-screen-title">{title}</DialogTitle>
            {action ? <div className="ui-screen-action">{action}</div> : null}
            {dock === "docked" ? (
              <DialogClose asChild>
                <Button variant="icon" aria-label={`Закрити: ${title}`}>
                  <X className="size-5" aria-hidden />
                </Button>
              </DialogClose>
            ) : null}
          </div>
          {description ? <DialogDescription className="sr-only">{description}</DialogDescription> : null}
          <div ref={setBody} className="ui-screen-body">
            {children}
          </div>
          {footer ? <div className="ui-screen-footer">{footer}</div> : null}
        </DialogContent>
      </ScreenPrimitive.Portal>
    </Dialog>
  );
};

export { Screen };
