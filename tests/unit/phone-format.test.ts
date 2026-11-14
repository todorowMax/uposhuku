// Нормалізація номера, маска й хеш телефона (lib/phone/*): чисті функції.

import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "@/lib/phone/format";
import { phoneHash } from "@/lib/phone/hash";

describe("normalizePhone", () => {
  it.each([
    ["+380501234567", "+380501234567"],
    ["380501234567", "+380501234567"],
    ["0501234567", "+380501234567"],
    ["050 123 45 67", "+380501234567"],
    ["+38 (050) 123-45-67", "+380501234567"],
    ["00380501234567", "+380501234567"],
    ["+48 601 234 567", "+48601234567"],
    ["48601234567", "+48601234567"],
    ["+1 (415) 555-2671", "+14155552671"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(["", "abc", "+", "12345", "+380 50 123", "380501234", "3805012345678", "+0501234567", "050-123-45-67-89", "+38050+1234567", "tel:+380501234567", "+1234567890123456", "(0)501234567x"])("сміття %j → null", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe("maskPhone", () => {
  it("український номер: код країни й дві останні цифри", () => {
    expect(maskPhone("+380501234545")).toBe("+380 •• ••• •• 45");
  });
  it("інша країна: лише дві останні цифри", () => {
    expect(maskPhone("+48601234567")).toBe("+••••••••• 67");
    expect(maskPhone("+48601234567")).not.toContain("601");
  });
});

describe("phoneHash", () => {
  it("стабільний, залежить від ключа й номера, не містить номера", async () => {
    const first = await phoneHash("+380501234567", "key-one");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await phoneHash("+380501234567", "key-one")).toBe(first);
    expect(await phoneHash("+380501234567", "key-two")).not.toBe(first);
    expect(await phoneHash("+380501234568", "key-one")).not.toBe(first);
    expect(first).not.toContain("380501234567");
  });
  it("порожній ключ відхиляється", async () => {
    await expect(phoneHash("+380501234567", "")).rejects.toThrow();
  });
});
