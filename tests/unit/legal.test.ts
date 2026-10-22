import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, fill, LEGAL_VALUES, OPERATOR } from "@/lib/legal/config";
import { LEGAL_LINKS } from "@/lib/legal/links";
import { offerSections } from "@/lib/legal/offer";
import { PRIVACY_INTRO, privacySections } from "@/lib/legal/privacy";
import { safeDealOfferSections } from "@/lib/legal/safe-deal-offer";
import { TERMS_INTRO, termsSections } from "@/lib/legal/terms";
import { numbered } from "@/lib/legal/types";

const everyText = () => [
  TERMS_INTRO,
  PRIVACY_INTRO,
  ...[...offerSections(), ...termsSections(), ...privacySections()].flatMap((section) => [section.title, ...section.items]),
];

describe("правові тексти", () => {
  it("не лишають нерозкритих {плейсхолдерів}", () => {
    for (const text of everyText()) expect(fill(text), text.slice(0, 60)).not.toMatch(/\{\w+\}/);
  });

  it("реквізити беруться з одного місця", () => {
    expect(LEGAL_VALUES.entity).toBe(OPERATOR.entity);
    expect(LEGAL_VALUES.email).toBe(CONTACT_EMAIL);
    expect(OPERATOR.taxId).toMatch(/^\d{10}$/);
  });

  it("політика описує статистику й журнал помилок, і не стверджує, що аналітики немає", () => {
    const sections = privacySections();
    const stats = sections.find((section) => section.id === "statistics");
    expect(stats).toBeDefined();
    const text = stats!.items.map(fill).join("\n");
    expect(text).toMatch(/180 днів/);
    expect(text).toMatch(/30 днів/);
    expect(text).toMatch(/Global Privacy Control/);
    expect(sections.flatMap((section) => section.items).map(fill).join("\n")).not.toMatch(/У сервісі немає аналітики/);
  });

  it("безпечна угода вимкнена: про холд і комісію в документах мовчимо", () => {
    const all = everyText().map(fill).join("\n");
    expect(all).not.toMatch(/холд|блокуєтьс|комісі/i);
    expect(offerSections().some((section) => section.id === "safe-deal")).toBe(false);
  });

  it("оферта безпечної угоди: без нерозкритих плейсхолдерів, з вимогами банку", () => {
    const sections = safeDealOfferSections();
    const all = sections.flatMap((section) => [section.title, ...section.items]).map(fill).join("\n");
    expect(all).not.toMatch(/\{\w+\}/);
    // Вимоги Monobank до договору: технічні послуги зі ссилкою на Закон і чітка сума тарифу.
    expect(all).toMatch(/Про платіжні послуги/);
    expect(all).toMatch(/пункту 8 частини 1 статті 9/);
    expect(all).toMatch(/технічного характеру/);
    expect(all).toContain(`${LEGAL_VALUES.fee}%`);
    const internal = [...all.matchAll(/\]\((\/[^)#]*)/g)].map((match) => match[1]);
    const known = new Set<string>(LEGAL_LINKS.map((link) => link.href));
    for (const href of internal) expect(known.has(href), href).toBe(true);
    numbered(sections).forEach((section, index) => expect(section.title.startsWith(`${index + 1}. `)).toBe(true));
  });

  it("нумерує розділи й пункти підряд", () => {
    const sections = numbered(offerSections());
    sections.forEach((section, index) => {
      expect(section.title.startsWith(`${index + 1}. `)).toBe(true);
      section.items.forEach((item, itemIndex) => expect(item.startsWith(`${index + 1}.${itemIndex + 1}. `)).toBe(true));
    });
  });

  it("усі внутрішні посилання ведуть на існуючі сторінки", () => {
    const known = new Set<string>(LEGAL_LINKS.map((link) => link.href));
    const hrefs = everyText().flatMap((text) => [...text.matchAll(/\]\((\/[^)#]*)/g)].map((match) => match[1]));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(known.has(href), href).toBe(true);
  });
});
