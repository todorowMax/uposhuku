// lib/globe/region.ts
//
// Межі детальної текстури навколо України. Спільні для скрипта, який її
// малює, і шейдера, який кладе її поверх загальної текстури Землі: якщо
// числа розійдуться, рельєф з'їде відносно кордонів.

export interface GeoBounds {
  lngMin: number;
  lngMax: number;
  latMin: number;
  latMax: number;
}

/**
 * Детальна латка. Знизу захоплює південний берег Чорного моря, зверху
 * Білорусь: при нахиленій камері обидва краї потрапляють у кадр, і на
 * межі латки різкість не має падати посеред екрана.
 */
export const REGION: GeoBounds & { pxPerDeg: number } = {
  lngMin: 12,
  lngMax: 50,
  latMin: 36,
  latMax: 58,
  // 80 пікселів на градус: 3040×1760, під ліміт 4096 навіть на телефонах.
  pxPerDeg: 80,
};

/** Загальна текстура всієї Землі, рівнокутна проєкція 2:1. */
export const WORLD_TEXTURE_WIDTH = 4096;

/** Смуга по краю латки, у якій вона плавно тане в загальну текстуру, градуси. */
export const REGION_FADE_DEG = 1.5;

/** Приблизні межі України, куди камері дозволено дивитися. */
export const UKRAINE_BOUNDS: GeoBounds = {
  lngMin: 22.1,
  lngMax: 40.3,
  latMin: 44.3,
  latMax: 52.4,
};

export const regionSize = () => ({
  width: Math.round((REGION.lngMax - REGION.lngMin) * REGION.pxPerDeg),
  height: Math.round((REGION.latMax - REGION.latMin) * REGION.pxPerDeg),
});
