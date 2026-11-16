// tests/unit/motion-tokens.test.ts
//
// Шкала руху живе у двох місцях: CSS-токени (app/styles/tokens.css) і числа для GSAP (lib/ui/motion-tokens.ts).
// Тест тримає їх однаковими й стежить за правилами шкали: вихід коротший за вхід.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DURATION_MS, EASE_CSS } from "@/lib/ui/motion-tokens";
import { layerStart } from "@/lib/ui/transitions";

const css = readFileSync(join(process.cwd(), "app/styles/tokens.css"), "utf8");

const token = (name: string): string | undefined => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1].trim();

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

describe("шкала руху: CSS і код", () => {
  it.each(Object.entries(DURATION_MS))("тривалість %s збігається з токеном", (name, ms) => {
    expect(token(`--dur-${kebab(name)}`)).toBe(`${ms}ms`);
  });

  it.each(Object.entries(EASE_CSS))("крива %s збігається з токеном", (name, curve) => {
    expect(token(`--ease-${name}`)).toBe(curve);
  });

  it("у CSS немає тривалості, якої не знає код", () => {
    const inCss = [...css.matchAll(/--dur-([a-z-]+):/g)].map((match) => match[1]).sort();
    expect(inCss).toEqual(Object.keys(DURATION_MS).map(kebab).sort());
  });

  it("вихід коротший за вхід, повернення в кнопку коротше за розкриття", () => {
    expect(DURATION_MS.exit).toBeLessThan(DURATION_MS.enter);
    expect(DURATION_MS.morphBack).toBeLessThan(DURATION_MS.morph);
  });
});

describe("layerStart: звідки шар приїжджає", () => {
  it("права панель їде по x, шторка по y", () => {
    expect(layerStart("right", false)).toEqual({ x: 24, opacity: 0 });
    expect(layerStart("bottom", false)).toEqual({ y: 24, opacity: 0 });
  });

  it("з prefers-reduced-motion зсуву немає, лишається проявлення", () => {
    expect(layerStart("right", true)).toEqual({ opacity: 0 });
    expect(layerStart("bottom", true)).toEqual({ opacity: 0 });
  });
});
