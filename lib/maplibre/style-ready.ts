// lib/maplibre/style-ready.ts
//
// `map.setLayoutProperty` кидає «Style is not done loading», коли стиль ще вантажиться або оновлює джерела (перший
// кадр, зміна режиму просто під час завантаження тайлів). Тут дію виконуємо, лише коли стиль готовий, а інакше
// чекаємо `styledata` чи `idle` і пробуємо знову. Повертає скасування для cleanup ефекту.

import type { Map as MapLibreMap } from "maplibre-gl";

type StyleProbe = Pick<MapLibreMap, "isStyleLoaded" | "on" | "off">;

export const whenStyleReady = (map: StyleProbe, run: () => void): (() => void) => {
  let cancelled = false;
  const attempt = () => {
    if (cancelled || !map.isStyleLoaded()) return;
    cancelled = true;
    map.off("styledata", attempt);
    map.off("idle", attempt);
    run();
  };
  if (map.isStyleLoaded()) {
    run();
    return () => {};
  }
  map.on("styledata", attempt);
  map.on("idle", attempt);
  return () => {
    cancelled = true;
    map.off("styledata", attempt);
    map.off("idle", attempt);
  };
};
