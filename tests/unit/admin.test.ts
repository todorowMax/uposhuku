import { describe, expect, it } from "vitest";
import { adminHostAllowed, isAdmin, parseAdminEmails, parseAdminHosts } from "@/lib/admin/access";
import { checkComment, decisionLine } from "@/lib/admin/decisions";

describe("доступ до адмінки", () => {
  const policy = { emails: parseAdminEmails(" Max@Example.com, ,boss@example.com;extra@example.com "), openLogin: false, allowDevLogin: false };

  it("список пошт розбирається без регістру й порожніх", () => {
    expect(policy.emails).toEqual(["max@example.com", "boss@example.com", "extra@example.com"]);
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("   ")).toEqual([]);
  });

  it("пускає лише пошти зі списку", () => {
    expect(isAdmin({ email: "MAX@example.com", via: "email" }, policy)).toBe(true);
    expect(isAdmin({ email: "other@example.com", via: "google" }, policy)).toBe(false);
  });

  it("порожній список не пускає нікого", () => {
    expect(isAdmin({ email: "max@example.com", via: "google" }, { ...policy, emails: [] })).toBe(false);
  });

  it("де код входу всім відомий, пошта не доказ: лише Google або явний дозвіл", () => {
    const open = { ...policy, openLogin: true };
    expect(isAdmin({ email: "max@example.com", via: "email" }, open)).toBe(false);
    expect(isAdmin({ email: "max@example.com", via: "google" }, open)).toBe(true);
    expect(isAdmin({ email: "max@example.com", via: "email" }, { ...open, allowDevLogin: true })).toBe(true);
  });
});

describe("рішення модератора: тексти", () => {
  it("коментар обов'язковий, обрізається по краях і має межі", () => {
    expect(checkComment("  ")).toHaveProperty("error");
    expect(checkComment("коротко")).toHaveProperty("error");
    expect(checkComment(undefined)).toHaveProperty("error");
    expect(checkComment("x".repeat(1001))).toHaveProperty("error");
    expect(checkComment("  Роботу здано за ТЗ.  ")).toEqual({ comment: "Роботу здано за ТЗ." });
  });

  it("рядок у стрічці називає угоду, етап, наслідок і коментар, без довгих тире", () => {
    const line = decisionLine({ number: "#A1B2" }, { title: "Сайт" }, "refund", "Роботи немає.");
    expect(line).toContain("#A1B2");
    expect(line).toContain("«Сайт»");
    expect(line).toContain("повертаються замовнику");
    expect(line).toContain("Коментар модератора: Роботи немає.");
    for (const action of ["release", "refund", "rework"] as const) expect(decisionLine({ number: "#1" }, { title: "Е" }, action, "ok")).not.toMatch(/[—–]/);
  });
});

describe("підписи адмінки", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");

  it("холд: скільки лишилось, менше доби, збіг, немає", async () => {
    const { holdLeft } = await import("@/lib/admin/format");
    expect(holdLeft("2026-10-24T15:00:00Z", now)).toEqual({ text: "Холд ще 5 дн 3 год", tone: "ok" });
    expect(holdLeft("2026-10-19T17:00:00Z", now)).toEqual({ text: "Холд ще 5 год", tone: "soon" });
    expect(holdLeft("2026-10-19T12:30:00Z", now)).toEqual({ text: "Холд закінчується за годину", tone: "soon" });
    expect(holdLeft("2026-10-19T11:59:00Z", now)).toEqual({ text: "Холд збіг", tone: "late" });
    expect(holdLeft(null, now)).toBeNull();
  });

  it("скільки спір відкритий", async () => {
    const { openFor } = await import("@/lib/admin/format");
    expect(openFor("2026-10-19T11:40:00Z", now)).toBe("щойно");
    expect(openFor("2026-10-19T07:00:00Z", now)).toBe("5 год");
    expect(openFor("2026-10-16T12:00:00Z", now)).toBe("3 дн");
  });
});

describe("з якого хоста видно адмінку", () => {
  const hosts = parseAdminHosts(" Panel.Example.com , second.example.com:8443");

  it("хости чистяться від порту й регістру", () => {
    expect(hosts).toEqual(["panel.example.com", "second.example.com"]);
  });

  it("задані хости: лише вони, основний домен і workers.dev дають 404", () => {
    const policy = { hosts, production: true };
    expect(adminHostAllowed("panel.example.com", policy)).toBe(true);
    expect(adminHostAllowed("PANEL.example.com:443", policy)).toBe(true);
    expect(adminHostAllowed("example.com", policy)).toBe(false);
    expect(adminHostAllowed("uposhuku.team.workers.dev", policy)).toBe(false);
    expect(adminHostAllowed(null, policy)).toBe(false);
  });

  it("не задані: на проді адмінки немає, поза продом без обмеження", () => {
    expect(adminHostAllowed("example.com", { hosts: [], production: true })).toBe(false);
    expect(adminHostAllowed("localhost:3031", { hosts: [], production: false })).toBe(true);
  });
});
