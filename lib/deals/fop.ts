// lib/deals/fop.ts
//
// Чи виконавець — ФОП. Справжнє значення житиме в профілі (з реквізитами в
// налаштуваннях). Поки безпечна угода вимкнена, статус нікому не приписуємо:
// усі false. Коли її ввімкнуть, до появи справжнього поля це детерміновано за
// id (приблизно двоє з трьох). Єдине місце, тож і сервер, і інтерфейс бачать те саме.

import { SAFE_DEAL_ENABLED } from "./flags";

export const isFop = (performerId: string): boolean => {
  if (!SAFE_DEAL_ENABLED) return false;
  let hash = 2166136261;
  for (let index = 0; index < performerId.length; index++) {
    hash ^= performerId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 3 !== 0;
};
