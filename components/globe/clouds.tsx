/**
 * Хмари по краях глобуса: ніби дивимося на Україну крізь розрив у
 * хмарах. Лише декор поверх сцени, жестів не перехоплює.
 *
 * Джерело: генерація в Artist, прозорість вирізана скриптом
 * scripts/build-cloud-assets.ts.
 */
export function GlobeClouds() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[var(--z-map-overlay)] overflow-hidden">
      <img
        src="/globe/clouds-left.webp"
        alt=""
        className="globe-cloud globe-cloud-left"
        draggable={false}
      />
      <img
        src="/globe/clouds-right.webp"
        alt=""
        className="globe-cloud globe-cloud-right"
        draggable={false}
      />
    </div>
  );
}
