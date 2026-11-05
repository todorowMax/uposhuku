// lib/legal/links.ts

/** Оферта безпечної угоди в списку лише коли функція ввімкнена для всіх (режим `on`); саму сторінку читає банк, вона лишається. */
export const legalLinks = (safeDeal: boolean) => [
  { href: "/offer", label: "Публічна оферта" },
  ...(safeDeal ? [{ href: "/offer/safe-deal", label: "Оферта для виконавців" }] : []),
  { href: "/legal/terms", label: "Умови користування" },
  { href: "/legal/privacy", label: "Конфіденційність" },
  { href: "/contacts", label: "Контакти" },
];
