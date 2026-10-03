// lib/legal/types.ts

export interface LegalSectionData {
  title: string;
  /** Якір, щоб послатися на розділ (`/legal/terms#refunds`). */
  id?: string;
  /** Абзаци; нумерацію пунктів («1.1.») пишемо прямо в тексті, бо вона частина договору. */
  items: string[];
}

/** Розділи, залежні від прапорця, лишаємо `false`/`undefined` і відсікаємо тут. */
export const visible = (sections: (LegalSectionData | false | undefined)[]): LegalSectionData[] =>
  sections.filter((section): section is LegalSectionData => Boolean(section));

/**
 * Нумерує розділи й пункти для договору: «3. Назва» і «3.1. Текст». Номери
 * рахуємо тут, а не пишемо в текстах, щоб умовний розділ (безпечна угода)
 * не зсував решту. Тому в самих текстах немає посилань «див. п. 6.2»:
 * посилаємося на розділ за назвою.
 */
export const numbered = (sections: LegalSectionData[]): LegalSectionData[] =>
  sections.map((section, index) => ({
    ...section,
    title: `${index + 1}. ${section.title}`,
    items: section.items.map((item, itemIndex) => `${index + 1}.${itemIndex + 1}. ${item}`),
  }));
