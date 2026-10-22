// lib/tags/combine.ts
//
// Підсумкові теги поля з трьох джерел: знайдені в тексті (auto), додані
// людиною вручну (manual) і прибрані нею з тексту (hidden). Одна функція на
// клієнт (живий перегляд) і на сервер (що саме зберігаємо), щоб вони ніколи
// не розходилися. Без словника: працює з готовими id.

export interface TagSources {
  /** Знайдені в тексті, у порядку згадки. */
  auto: readonly string[];
  manual?: readonly string[];
  hidden?: readonly string[];
  /** Скільки тегів усього. Вручну додані зрізу не підлягають: людина обрала їх прямо. */
  max?: number;
}

const unique = (ids: readonly string[]) => [...new Set(ids)];

/**
 * Спершу теги з тексту, далі додані вручну. Прихований тег зникає з тексту,
 * але не з ручних: якщо людина додала його сама, це сильніше за «прибрала».
 */
export const combineTags = ({ auto, manual = [], hidden = [], max = Infinity }: TagSources): string[] => {
  const own = unique(manual);
  const ownSet = new Set(own);
  const hide = new Set(hidden);
  const fromText = unique(auto).filter((id) => !hide.has(id) && !ownSet.has(id));
  return [...fromText.slice(0, Math.max(0, max - own.length)), ...own];
};
