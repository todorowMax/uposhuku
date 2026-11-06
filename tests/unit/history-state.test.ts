import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const FOLDERS = ["app", "components", "lib"];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

// replaceState(null) стирає службовий стан Next: потім перший же `popstate` на цьому записі (системне «назад»
// з шару, що відкрився після глибокого посилання) робить повне перезавантаження сторінки.
describe("історія браузера", () => {
  it("прибираючи параметр з адреси, зберігаємо стан Next", () => {
    const bad = FOLDERS.flatMap((folder) => files(join(ROOT, folder))).filter((path) => /history\.replaceState\(\s*null\b/.test(readFileSync(path, "utf8")));
    expect(bad.map((path) => path.replace(ROOT, ""))).toEqual([]);
  });
});
