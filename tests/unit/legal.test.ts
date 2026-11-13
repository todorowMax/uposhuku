import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, fill, LEGAL_VALUES, OPERATOR, UPDATED } from "@/lib/legal/config";
import { legalLinks } from "@/lib/legal/links";
import { offerSections } from "@/lib/legal/offer";
import { PRIVACY_INTRO, privacySections } from "@/lib/legal/privacy";
import { safeDealOfferSections } from "@/lib/legal/safe-deal-offer";
import { TERMS_INTRO, termsSections } from "@/lib/legal/terms";
import { type LegalFlags, numbered } from "@/lib/legal/types";

const OFF: LegalFlags = { safeDeal: false, crypto: false };
const SAFE: LegalFlags = { safeDeal: true, crypto: false };
const CRYPTO: LegalFlags = { safeDeal: false, crypto: true };
const ALL: LegalFlags = { safeDeal: true, crypto: true };

const textsOf = (sections: { title: string; items: string[] }[]) => sections.flatMap((section) => [section.title, ...section.items]);

/** Тексти документів за прапорцями: усе, що бачить людина (без оферти для виконавців, її читає банк, вона окрема). */
const docsText = (flags: LegalFlags) =>
  [TERMS_INTRO, PRIVACY_INTRO, ...textsOf([...offerSections(flags.safeDeal), ...termsSections(flags), ...privacySections(flags)])].map(fill).join("\n");

const everyText = () => [
  TERMS_INTRO,
  PRIVACY_INTRO,
  ...[...offerSections(true), ...termsSections(ALL), ...privacySections(ALL), ...safeDealOfferSections()].flatMap((section) => [section.title, ...section.items]),
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
    const all = docsText(OFF);
    expect(all).not.toMatch(/холд|блокуєтьс|комісі/i);
    expect(offerSections().some((section) => section.id === "safe-deal")).toBe(false);
  });

  it("безпечна угода ввімкнена для всіх (режим on): розділи про неї з'являються в оферті й умовах", () => {
    expect(offerSections(true).some((section) => section.id === "safe-deal")).toBe(true);
    const terms = termsSections(SAFE).flatMap((section) => section.items).map(fill).join("\n");
    expect(terms).toMatch(/Безпечна угода необов'язкова/);
    expect(termsSections(OFF).flatMap((section) => section.items).map(fill).join("\n")).not.toMatch(/Безпечна угода необов'язкова/);
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
    const known = new Set<string>(legalLinks(true).map((link) => link.href));
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

  it("політика й умови описують зашифровані реквізити виконавця і кому вони видні", () => {
    const privacy = privacySections().flatMap((section) => section.items).map(fill).join("\n");
    expect(privacy).toMatch(/Реквізити виконавця для прямого переказу/);
    expect(privacy).toMatch(/зашифрован/);
    expect(privacy).toMatch(/двоє сторін прийнятої угоди/);
    const terms = termsSections(OFF).flatMap((section) => section.items).map(fill).join("\n");
    expect(terms).toMatch(/зашифрованому вигляді/);
    expect(terms).toMatch(/24 години/);
    expect(terms).toMatch(/обмежена вашим банком/);
    // QR показує лише прапорець nbu_qr, який вимкнено, доки сканування не перевірено: в текстах про нього мовчимо.
    expect(`${privacy}\n${terms}`).not.toMatch(/QR/);
    // Раніше стверджували, що реквізитів сервіс не знає: тепер це неправда.
    expect(`${privacy}\n${terms}`).not.toMatch(/реквізит\S* (?:сервіс|платформа|ми) (?:не знає|не бачить|не зберігає)/i);
  });

  it("дати оновлення всіх змінених документів: 13 листопада 2026 року", () => {
    for (const date of [UPDATED.terms, UPDATED.privacy, UPDATED.offer, UPDATED.safeDealOffer]) expect(date).toBe("13 листопада 2026 року");
  });

  it("крипти немає в текстах, поки жоден крипто-прапорець не on; з ним з'являються розділ і попередження", () => {
    const off = docsText(OFF);
    expect(off).not.toMatch(/USDT|(?<!с)крипт|блокчейн|гаманц|WalletConnect|Reown|TronGrid|MetaMask/i);
    expect(termsSections(OFF).some((section) => section.id === "crypto")).toBe(false);
    expect(termsSections(SAFE).some((section) => section.id === "crypto")).toBe(false);

    const section = termsSections(CRYPTO).find((item) => item.id === "crypto");
    expect(section).toBeDefined();
    const crypto = section!.items.join("\n");
    for (const part of [/неможливо скасувати/, /мережі/, /адрес/, /Комісію мережі/, /приватних ключів/, /не мають статусу засобу платежу/, /заморозити/, /заборонені/]) expect(crypto).toMatch(part);
    const privacy = privacySections(CRYPTO).flatMap((item) => item.items).join("\n");
    for (const part of [/хеш транзакції/, /Reown/, /TronGrid/, /не належать нам/]) expect(privacy).toMatch(part);
  });

  it("безпечної угоди в умовах і політиці немає, поки режим не on; з нею з'являються її розділи", () => {
    expect(termsSections(OFF).some((section) => section.id === "disputes")).toBe(false);
    expect(termsSections(CRYPTO).some((section) => section.id === "disputes")).toBe(false);
    expect(termsSections(SAFE).some((section) => section.id === "disputes")).toBe(true);
    expect(privacySections(OFF).flatMap((item) => item.items).join("\n")).not.toMatch(/безпечної угоди: сума етапу/);
    expect(privacySections(SAFE).flatMap((item) => item.items).join("\n")).toMatch(/Платежі безпечної угоди/);
  });

  it("«Перевірена угода»: розділ є лише коли щось може її дати, з визначенням без обіцянки якості", () => {
    expect(termsSections(OFF).some((section) => section.id === "verified")).toBe(false);
    for (const flags of [SAFE, CRYPTO]) {
      const text = termsSections(flags).find((section) => section.id === "verified")?.items.join("\n") ?? "";
      expect(text).toMatch(/Перевірена угода/);
      expect(text).toMatch(/не говорить, що роботу виконано якісно/);
      expect(text).toMatch(/правдивий/);
      expect(text).toMatch(/Відгук без позначки не гірший/);
    }
    expect(termsSections(SAFE).find((section) => section.id === "verified")!.items.join("\n")).not.toMatch(/блокчейн/);
    expect(termsSections(CRYPTO).find((section) => section.id === "verified")!.items.join("\n")).toMatch(/блокчейн/);
  });

  it("слова «ескроу» немає там, де йдеться про холд: оферта виконавців, розділ оферти, умови без крипти", () => {
    const hold = [
      ...safeDealOfferSections().flatMap((section) => [section.title, ...section.items]),
      ...offerSections(true).filter((section) => section.id === "safe-deal").flatMap((section) => [section.title, ...section.items]),
      ...textsOf(termsSections(SAFE)),
    ];
    for (const text of hold) expect(text, text.slice(0, 60)).not.toMatch(/ескроу/i);
  });

  it("немає «остаточного рішення» й «виключного права» ні в одному тексті; спір описано як процедуру за правилами", () => {
    for (const text of everyText().map(fill)) {
      expect(text, text.slice(0, 60)).not.toMatch(/остаточне рішення|рішення[^.]*остаточне|виключне право/i);
    }
    const dispute = safeDealOfferSections().find((section) => section.id === "disputes")!.items.join("\n");
    expect(dispute).toMatch(/процедурою за правилами Сервісу/);
    expect(dispute).toMatch(/не позбавляє сторони права звернутися до суду/);
    expect(dispute).toMatch(/переглянути рішення/);
  });

  it("оферта виконавців: платіжну послугу надає банк, оператор не розпоряджається коштами, п. 8 не єдина підстава", () => {
    const all = safeDealOfferSections().flatMap((section) => [section.title, ...section.items]).join("\n");
    expect(all).toMatch(/надає виключно Банк/);
    expect(all).toMatch(/не розпоряджається коштами/);
    expect(all).toMatch(/не єдина підстава/);
    expect(all).toMatch(/Доручення\./);
  });

  it("PayPal і Wise (foreign_links) не згадуються в жодному публічному тексті", () => {
    expect(everyText().map(fill).join("\n")).not.toMatch(/PayPal|Wise|foreign_links/i);
  });

  it("цифри комісії беруться з коду: резерв і частка оператора разом дають комісію", () => {
    expect(Number(LEGAL_VALUES.operatorFee) + Number(LEGAL_VALUES.reserve)).toBe(Number(LEGAL_VALUES.fee));
    const all = safeDealOfferSections().flatMap((section) => section.items).map(fill).join("\n");
    expect(all).toContain(`близько ${LEGAL_VALUES.operatorFee}% від ціни`);
    expect(all).not.toMatch(/приблизно 5%|до 2%/);
  });

  it("політика: сроки зберігання, витік, передача за кордон, чеки, скарги", () => {
    const text = privacySections(OFF).flatMap((section) => [section.title, ...section.items]).map(fill).join("\n");
    for (const part of [/щонайменше 3 роки/, /Витік даних/, /без невиправданої затримки/, /за межами України/, /\*\*Чеки:\*\*/, /\*\*Скарги:\*\*/, /Що вважаємо готовим/]) expect(text).toMatch(part);
  });

  it("умови: способи оплати, докази, скарги, споживачі, податки й обхід є завжди", () => {
    const ids = termsSections(OFF).map((section) => section.id);
    for (const id of ["protection", "evidence", "complaints", "consumers", "bypass", "taxes"]) expect(ids).toContain(id);
    const all = termsSections(OFF).flatMap((section) => section.items).map(fill).join("\n");
    expect(all).not.toMatch(/Інших способів оплати через сервіс поки немає/);
    expect(all).toMatch(/Позначку «Я оплатив\(ла\)» ставить замовник/);
    expect(all).toMatch(/Оператор не є вашим податковим агентом/);
  });

  it("усі внутрішні посилання ведуть на існуючі сторінки", () => {
    const known = new Set<string>(legalLinks(true).map((link) => link.href));
    const hrefs = everyText().flatMap((text) => [...text.matchAll(/\]\((\/[^)#]*)/g)].map((match) => match[1]));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(known.has(href), href).toBe(true);
  });
});
