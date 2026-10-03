import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, fill, LEGAL_VALUES, OPERATOR } from "@/lib/legal/config";
import { LEGAL_LINKS } from "@/lib/legal/links";
import { offerSections } from "@/lib/legal/offer";
import { PRIVACY_INTRO, privacySections } from "@/lib/legal/privacy";
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

  it("безпечна угода вимкнена: про холд і комісію в документах мовчимо", () => {
    const all = everyText().map(fill).join("\n");
    expect(all).not.toMatch(/холд|блокуєтьс|комісі/i);
    expect(offerSections().some((section) => section.id === "safe-deal")).toBe(false);
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
