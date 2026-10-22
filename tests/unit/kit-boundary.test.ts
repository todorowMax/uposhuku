import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((match) => match[1]);

describe("kit/telemetry не залежить від застосунку", () => {
  const all = files(join(process.cwd(), "kit/telemetry"));

  it("жодного імпорту зі шляхом застосунку (@/…) і за межі kit", () => {
    for (const file of all) {
      for (const specifier of importsOf(file)) {
        expect(specifier.startsWith("@/"), `${file} імпортує ${specifier}`).toBe(false);
        if (specifier.startsWith(".")) {
          const resolved = join(file, "..", specifier);
          expect(resolved.includes(join("kit", "telemetry")), `${file} виходить за межі kit: ${specifier}`).toBe(true);
        }
      }
    }
  });

  it("core не знає ні React, ні Next", () => {
    for (const file of all.filter((path) => path.includes(join("telemetry", "core")))) {
      for (const specifier of importsOf(file)) {
        expect(/^(react|react-dom|next)(\/|$)/.test(specifier), `${file} імпортує ${specifier}`).toBe(false);
      }
    }
  });
});
