// lib/deals/stage-presets.ts
//
// Швидкі розбиття суми на етапи для прямого переказу. Чисті функції: суму й термін отримуємо ззовні.

export interface StageDraft {
  title: string;
  amount: number;
  days: number;
}

/** «30/70»: аванс і остаточний розрахунок. Залишок копійок у другому етапі, термін ділимо навпіл. */
export const splitAdvance = (amount: number, days: number, advancePercent = 30): StageDraft[] => {
  const advance = Math.max(1, Math.round((amount * advancePercent) / 100));
  const firstDays = Math.max(1, Math.floor(days / 2));
  return [
    { title: `Аванс ${advancePercent}%`, amount: advance, days: firstDays },
    { title: `Розрахунок ${100 - advancePercent}%`, amount: Math.max(1, amount - advance), days: Math.max(1, days - firstDays) },
  ];
};
