// lib/legal/links.ts

import { SAFE_DEAL_ENABLED } from "@/lib/deals/flags";

/** Оферта безпечної угоди в списку лише коли функція ввімкнена; саму сторінку читає банк, вона лишається. */
export const LEGAL_LINKS = [
  { href: "/offer", label: "Публічна оферта" },
  ...(SAFE_DEAL_ENABLED ? [{ href: "/offer/safe-deal", label: "Оферта для виконавців" }] : []),
  { href: "/legal/terms", label: "Умови користування" },
  { href: "/legal/privacy", label: "Конфіденційність" },
  { href: "/contacts", label: "Контакти" },
];
