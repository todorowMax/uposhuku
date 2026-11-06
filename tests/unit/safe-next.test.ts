import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/server/google";

// Браузер читає `\` як `/`, а табуляцію й переводи рядка в адресі викидає: тож `/\evil.example` і `/<TAB>/evil.example`
// після розбору URL ведуть на чужий хост, хоч і починаються з одного `/`.
const ORIGIN = "https://findlyfy.test";
const landing = (value: string | null | undefined) => new URL(safeNext(value), ORIGIN);

describe("safeNext", () => {
  it("свої шляхи лишає як є, разом із запитом і якорем", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/cabinet")).toBe("/cabinet");
    expect(safeNext("/cabinet?tab=requests#top")).toBe("/cabinet?tab=requests#top");
  });

  it("порожнє, не-шлях і чужі схеми ведуть на головну", () => {
    for (const value of [null, undefined, "", "evil.example", "https://evil.example", "javascript:alert(1)", "data:text/html,x"]) expect(safeNext(value)).toBe("/");
  });

  it("//host не відкритий редірект", () => {
    expect(landing("//evil.example/x").origin).toBe(ORIGIN);
  });

  it("зворотна скісна риса й керівні символи не дають вийти на чужий хост", () => {
    for (const value of ["/\\evil.example", "/\\/evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "\\\\evil.example"]) {
      expect(landing(value).origin, JSON.stringify(value)).toBe(ORIGIN);
    }
  });
});
