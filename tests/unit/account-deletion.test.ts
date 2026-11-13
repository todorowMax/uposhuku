// Чисті правила видалення акаунта (lib/account/deletion.ts) і форма виписки (lib/account/export-shape.ts).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { privacySections } from "@/lib/legal/privacy";
import { dealGrip, DELETE_WORD, DELETED_NAME, hadDispute, isDeleteWord, isRetentionWindow, isTombstoneEmail, requisitesDeletableNow, retentionExpired, RETENTION_MS, tombstoneEmail, withoutPerformerIdentity } from "@/lib/account/deletion";
import { dealsOnlyOwnSide, OTHER_SIDE } from "@/lib/account/export-shape";
import { createDeal } from "@/lib/deals/machine";
import type { Deal, DealMethod, StageStatus } from "@/lib/deals/types";

const deal = (over: { method?: DealMethod; status?: Deal["status"]; stages?: StageStatus[]; escrow?: boolean } = {}): Deal => {
  const { method = "direct", status = "accepted", stages = ["pending"], escrow = false } = over;
  const base = createDeal("deal_t1", { requestId: "r", responseId: "x", performer: { id: "me-p", name: "Петро", photo: "/p.jpg", avatarIndex: 1, specialty: "Дизайн", fop: false }, method, stages: stages.map(() => ({ title: "Етап", amount: 500, days: 3 })) }, 0);
  return { ...base, status, stages: base.stages.map((stage, index) => ({ ...stage, status: stages[index], ...(escrow ? { escrow: { address: "0xabc", client: "0xdef" } } : {}) })) };
};

describe("dealGrip: що угода означає для видалення", () => {
  it.each<[string, Deal, string]>([
    ["прямий переказ: «я оплатив» чекає підтвердження", deal({ stages: ["claimed"] }), "money"],
    ["безпечна: заморожено", deal({ method: "safe", stages: ["funded"] }), "money"],
    ["безпечна: здано", deal({ method: "safe", stages: ["delivered"] }), "money"],
    ["безпечна: спір", deal({ method: "safe", stages: ["disputed"] }), "money"],
    ["безпечна: виплата в дорозі", deal({ method: "safe", stages: ["releasing"] }), "money"],
    ["безпечна: повернення в дорозі", deal({ method: "safe", stages: ["refunding"] }), "money"],
    ["ескроу: адреса контракту відома, етап не закрито", deal({ method: "escrow", stages: ["pending"], escrow: true }), "money"],
    ["прийнята, жоден етап не оплачено", deal({ stages: ["pending", "pending"] }), "idle"],
    ["запропонована", deal({ status: "proposed" }), "idle"],
    ["ескроу без адреси контракту", deal({ method: "escrow", stages: ["pending"] }), "idle"],
    ["ескроу, етап закрито", deal({ method: "escrow", status: "completed", stages: ["released"], escrow: true }), "closed"],
    ["завершена", deal({ status: "completed", stages: ["released"] }), "closed"],
    ["скасована", deal({ status: "cancelled", stages: ["refunded"] }), "closed"],
    ["відхилена", deal({ status: "declined" }), "closed"],
  ])("%s → %s", (_name, value, expected) => {
    expect(dealGrip(value)).toBe(expected);
  });
});

describe("знімок реквізитів і строк", () => {
  it("закрита угода без спору й скарг: стираємо одразу", () => {
    expect(requisitesDeletableNow(deal({ status: "completed", stages: ["released"] }), false)).toBe(true);
  });

  it("скарга, спір (зараз чи колись) або жива угода: лишаємо", () => {
    const closed = deal({ status: "completed", stages: ["released"] });
    expect(requisitesDeletableNow(closed, true)).toBe(false);
    expect(requisitesDeletableNow({ ...closed, disputed: true }, false)).toBe(false);
    const wasDisputed = { ...closed, stages: closed.stages.map((stage) => ({ ...stage, disputedAt: "2026-01-01T00:00:00.000Z" })) };
    expect(hadDispute(wasDisputed)).toBe(true);
    expect(requisitesDeletableNow(wasDisputed, false)).toBe(false);
    expect(requisitesDeletableNow(deal({ stages: ["pending"] }), false)).toBe(false);
  });

  it("строк 3 роки від закриття, межа включена", () => {
    expect(retentionExpired(1000, 1000 + RETENTION_MS - 1)).toBe(false);
    expect(retentionExpired(1000, 1000 + RETENTION_MS)).toBe(true);
  });

  it("прибирання за строком іде в одне п'ятихвилинне вікно на добу", () => {
    expect(isRetentionWindow(Date.UTC(2026, 10, 14, 3, 0))).toBe(true);
    expect(isRetentionWindow(Date.UTC(2026, 10, 14, 3, 4, 59))).toBe(true);
    expect(isRetentionWindow(Date.UTC(2026, 10, 14, 3, 5))).toBe(false);
    expect(isRetentionWindow(Date.UTC(2026, 10, 14, 4, 0))).toBe(false);
  });
});

describe("«могила»", () => {
  it("пошта не існує й розпізнається", () => {
    expect(tombstoneEmail("u1")).toBe("deleted-u1@deleted.invalid");
    expect(isTombstoneEmail(tombstoneEmail("u1"))).toBe(true);
    expect(isTombstoneEmail("a@example.com")).toBe(false);
  });

  it("слово підтвердження: без урахування регістру й пробілів, інше не годиться", () => {
    expect(isDeleteWord(DELETE_WORD)).toBe(true);
    expect(isDeleteWord("  видалити ")).toBe(true);
    expect(isDeleteWord("видалити акаунт")).toBe(false);
    expect(isDeleteWord(undefined)).toBe(false);
  });

  it("ім'я, фото й спеціальність виконавця в угоді замінені, решта лишається", () => {
    const source = deal({ stages: ["pending"] });
    const clean = withoutPerformerIdentity(source);
    expect(clean.performer.name).toBe(DELETED_NAME);
    expect(clean.performer.photo).toBeUndefined();
    expect(clean.performer.specialty).toBe("");
    expect(clean.performer.id).toBe("me-p");
    expect(clean.stages).toEqual(source.stages);
  });
});

describe("виписка: угода з боку власника", () => {
  it("коли людина замовник, виконавця замінює мітка; коли виконавець, лишається як є", () => {
    const source = deal({ status: "completed", stages: ["released"] });
    const [asCustomer, asPerformer] = dealsOnlyOwnSide([
      { deal: source, asCustomer: true },
      { deal: source, asCustomer: false },
    ]);
    expect(asCustomer.performer).toMatchObject({ id: "other", name: OTHER_SIDE, specialty: "" });
    expect(JSON.stringify(asCustomer)).not.toContain("me-p");
    expect(asPerformer.performer.name).toBe("Петро");
    expect(asPerformer.role).toBe("performer");
  });
});

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

describe("рядок користувача ніколи не видаляється фізично", () => {
  // Зовнішні ключі з onDelete: cascade на users стерли б угоди, платежі й відгуки разом із рядком.
  it("у коді застосунку немає DELETE по users", () => {
    const offenders = ["app", "lib", "worker", "components"].flatMap(sources).filter((file) => /delete\(\s*users\s*\)|delete\s+from\s+["`]?users\b/i.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("політика конфіденційності й код видалення не розходяться", () => {
  it("описує видалення в меню й виписку даних, а не лист на пошту", () => {
    const text = privacySections({ safeDeal: true, crypto: true }).flatMap((section) => section.items).join("\n");
    expect(text).toContain("«Видалити акаунт»");
    expect(text).toContain("«Завантажити мої дані»");
    expect(text).not.toContain("напишіть на {email} з пошти акаунта");
  });
});
