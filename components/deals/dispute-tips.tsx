"use client";

// components/deals/dispute-tips.tsx
//
// «Як уникнути проблем у спорі»: згорнута підказка в формі умов і на оплаті. Текст порад один, тут.
// Це поради, а не гарантії: модератор читає факти, а гроші прямого переказу ми не повертаємо.

import { Button } from "@/components/ui/button";
import { ResponsiveHint } from "@/components/ui/responsive-hint";

export const DISPUTE_TIPS: readonly string[] = [
  "Зафіксуйте умови в картці угоди: що робимо, за скільки і що вважаємо готовим.",
  "Спілкуйтеся в чаті сайту: модератор бачить лише його.",
  "Зберігайте чек і додайте його до етапу.",
  "Здавайте результат кнопкою «Здати етап» і додайте пояснення чи посилання.",
  "Велику суму діліть на етапи. Безпечна угода, якщо вона вам доступна, тримає гроші до підтвердження.",
];

export const DisputeTips = () => (
  <ResponsiveHint
    title="Як уникнути проблем у спорі"
    popoverClassName="max-w-80"
    trigger={
      <Button variant="link" className="w-fit text-sm">
        Як уникнути проблем у спорі
      </Button>
    }
  >
    <ul className="grid gap-2 pl-4 text-sm leading-snug text-ink list-disc">
      {DISPUTE_TIPS.map((tip) => (
        <li key={tip}>{tip}</li>
      ))}
    </ul>
  </ResponsiveHint>
);
