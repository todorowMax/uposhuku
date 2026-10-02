// lib/deals/fop.ts
//
// Чи виконавець — ФОП. Справжнє значення житиме в профілі (з реквізитами в
// налаштуваннях); поки його немає, детерміновано за id: приблизно двоє з
// трьох. Єдине місце, тож і сервер, і інтерфейс бачать те саме.

export const isFop = (performerId: string): boolean => {
  let hash = 2166136261;
  for (let index = 0; index < performerId.length; index++) {
    hash ^= performerId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 3 !== 0;
};
