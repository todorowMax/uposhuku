"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import type { LngLat, Map as MapLibreMap } from "maplibre-gl";

/**
 * Хмари над планетою. Це картинки (public/map/clouds.webp, їх малює
 * scripts/build-space.ts) і CSS-трансформації: без шейдерів, для WebGL
 * роботи немає, тож майже безкоштовно навіть у Safari.
 *
 * Кожна хмара прив'язана до місця на планеті: на старті ми беремо точку
 * біля краю кадру, а якщо там космос (на великих моніторах глобус не
 * заповнює кадр), зсуваємо її всередину, поки не опиниться на планеті.
 * Далі хмара їде разом із планетою, а «висота» над поверхнею дає
 * паралакс: ближчі хмари відлітають від центру сильніше й ростуть швидше.
 * За обрієм планети хмара ховається, а при наближенні до міст тане, щоб
 * не закривати роботу.
 */

/** Спрайт у атласі clouds.webp (4×2) і де його шукати в кадрі. */
interface Cloud {
  sprite: number;
  /** Бажане положення в кадрі, частки ширини й висоти. */
  fx: number;
  fy: number;
  /** Ширина в одиницях vmin (з обмеженням по vw). */
  size: number;
  /** 0..1: «висота» хмари, що дає паралакс. */
  depth: number;
  opacity: number;
  /** Дрейф у спокої: на скільки px і за скільки секунд туди-назад. */
  drift: [number, number];
}

const CLOUDS: Cloud[] = [
  { sprite: 2, fx: 0.05, fy: 0.34, size: 1.05, depth: 0.9, opacity: 0.95, drift: [20, 52] },
  { sprite: 6, fx: 0.95, fy: 0.3, size: 0.95, depth: 0.75, opacity: 0.92, drift: [-18, 60] },
  { sprite: 4, fx: 0.03, fy: 0.64, size: 1.2, depth: 1, opacity: 0.95, drift: [22, 66] },
  { sprite: 3, fx: 0.97, fy: 0.68, size: 1.15, depth: 0.85, opacity: 0.95, drift: [-22, 58] },
  { sprite: 0, fx: 0.22, fy: 0.93, size: 1.0, depth: 0.6, opacity: 0.9, drift: [16, 46] },
  { sprite: 5, fx: 0.8, fy: 0.95, size: 0.95, depth: 0.55, opacity: 0.88, drift: [-14, 50] },
  { sprite: 7, fx: 0.5, fy: 0.99, size: 0.8, depth: 0.4, opacity: 0.8, drift: [10, 42] },
];

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Місце на планеті видно з камери. Лише публічне API: проєктуємо точку на екран
 * і назад, і якщо вона за обрієм глобуса, назад повернеться вже інше місце.
 */
const visible = (map: MapLibreMap, lngLat: LngLat) => {
  try {
    const back = map.unproject(map.project(lngLat));
    return Math.abs(back.lat - lngLat.lat) < 0.05 && Math.abs(((back.lng - lngLat.lng + 540) % 360) - 180) < 0.05;
  } catch {
    return false;
  }
};

/** Точка екрана лежить на планеті, а не в космосі: туди й назад дає ту саму точку. */
const onPlanet = (map: MapLibreMap, x: number, y: number) => {
  try {
    const lngLat = map.unproject([x, y]);
    if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return null;
    const back = map.project(lngLat);
    return Math.hypot(back.x - x, back.y - y) < 2 && visible(map, lngLat) ? lngLat : null;
  } catch {
    return null;
  }
};

export function CloudLayer({ mapRef, ready }: { mapRef: RefObject<MapLibreMap | null>; ready: boolean }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const anchors: (LngLat | null)[] = [];
    let zoom0 = map.getZoom();
    let frame = 0;

    /** Прив'язка до планети: від бажаної точки кроками до центру кадру, поки не потрапимо на неї. */
    const anchor = () => {
      const { clientWidth: width, clientHeight: height } = map.getContainer();
      zoom0 = map.getZoom();
      CLOUDS.forEach((cloud, index) => {
        let found: LngLat | null = null;
        for (let step = 0; step <= 12 && !found; step++) {
          const t = step / 12;
          found = onPlanet(map, (cloud.fx + (0.5 - cloud.fx) * t * 0.8) * width, (cloud.fy + (0.62 - cloud.fy) * t * 0.8) * height);
        }
        anchors[index] = found;
      });
    };

    const update = () => {
      frame = 0;
      const { clientWidth: width, clientHeight: height } = map.getContainer();
      const zoom = map.getZoom();
      const near = 1 - smoothstep(zoom0 + 0.7, zoom0 + 2, zoom);
      CLOUDS.forEach((cloud, index) => {
        const element = refs.current[index];
        const lngLat = anchors[index];
        if (!element) return;
        if (!lngLat || near <= 0 || !visible(map, lngLat)) {
          element.style.visibility = "hidden";
          return;
        }
        const point = map.project(lngLat);
        const lift = cloud.depth * 0.12;
        const x = point.x + (point.x - width / 2) * lift;
        const y = point.y + (point.y - height / 2) * lift;
        const scale = 1 + (zoom - zoom0) * cloud.depth * 0.35;
        element.style.visibility = "visible";
        element.style.opacity = String((cloud.opacity * near).toFixed(3));
        element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    anchor();
    update();
    map.on("move", schedule);
    map.on("resize", () => {
      anchor();
      schedule();
    });
    return () => {
      map.off("move", schedule);
      cancelAnimationFrame(frame);
    };
  }, [mapRef, ready]);

  return (
    <div aria-hidden className="cloud-layer" data-ready={ready || undefined}>
      {CLOUDS.map((cloud, index) => (
        <div
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          className="cloud"
          style={{ width: `min(${cloud.size * 100}vmin, ${Math.round(cloud.size * 40)}vw)`, visibility: "hidden" }}
        >
          <span
            className="cloud-drift"
            style={
              {
                backgroundPosition: `${(cloud.sprite % 4) * 33.3333}% ${Math.floor(cloud.sprite / 4) * 100}%`,
                "--dx": `${reduced() ? 0 : cloud.drift[0]}px`,
                "--dur": `${cloud.drift[1]}s`,
                animationDelay: `${-index * 7}s`,
              } as CSSProperties
            }
          />
        </div>
      ))}
    </div>
  );
}
