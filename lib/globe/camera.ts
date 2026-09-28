// lib/globe/camera.ts
//
// Камера карти поверх глобуса.
//
// Штатні OrbitControls у globe.gl крутять камеру навколо центру Землі:
// наблизитися можна лише до точки прямо під камерою, а нахил з'являється
// тільки якщо відвести камеру вбік. Для карти України потрібне інше:
// камера дивиться на точку на поверхні під заданим кутом, наближення
// веде до цієї точки, а перетягування зсуває саму точку. Так працюють
// карти з нахилом (pitch), і так макет ставить Україну «обличчям до
// людини».

import { Vector3 } from "three";
import { UKRAINE_BOUNDS } from "./region";
import type { GeoPoint } from "@/lib/map/types";

/** Радіус глобуса в одиницях three-globe. */
export const GLOBE_RADIUS = 100;
/** Кілометрів в одній одиниці сцени. */
export const KM_PER_UNIT = 6371 / GLOBE_RADIUS;

export interface MapView extends GeoPoint {
  /** Відстань від камери до точки фокуса, одиниці сцени. */
  distance: number;
  /**
   * Нахил від вертикалі, градуси. 0: дивимося згори, 90: з горизонту.
   * У макеті десь 55°, і північ країни тікає вдалину. Менший нахил
   * підносить верхню частину ближче до людини.
   */
  tilt: number;
}

/** Те саме перетворення, що в three-globe (`polar2Cartesian`). */
export const geoToCartesian = (lat: number, lng: number, altitude = 0): Vector3 => {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const r = GLOBE_RADIUS * (1 + altitude);
  return new Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
};

/** Одиничні вектори «вгору», «на північ» і «на схід» у точці поверхні. */
export const localFrame = (lat: number, lng: number) => {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const up = new Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
  // Похідна за широтою: широта росте, коли phi спадає.
  const north = new Vector3(
    -Math.cos(phi) * Math.cos(theta),
    Math.sin(phi),
    -Math.cos(phi) * Math.sin(theta)
  );
  const east = new Vector3().crossVectors(north, up).normalize();
  return { up, north, east };
};

export interface CameraPose {
  position: Vector3;
  target: Vector3;
  up: Vector3;
}

/**
 * Камера стоїть на південь від точки фокуса й дивиться на північ,
 * нахилена на `tilt` від вертикалі. Фокус піднятий на висоту плато,
 * щоб наближення впиралося в поверхню України, а не під неї.
 */
export const cameraPose = (view: MapView, focusAltitude = 0): CameraPose => {
  const target = geoToCartesian(view.lat, view.lng, focusAltitude);
  const { up, north } = localFrame(view.lat, view.lng);
  const tilt = (view.tilt * Math.PI) / 180;
  const direction = up
    .clone()
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(north, -Math.sin(tilt));
  return {
    position: target.clone().addScaledVector(direction, view.distance),
    target,
    // Верх кадру дивиться на північ.
    up: north,
  };
};

/**
 * Відстань, з якої ширина `widthKm` вміщається в кадр по горизонталі.
 * На вузькому екрані телефона камеру доводиться відводити далі.
 */
export const fitDistance = (widthKm: number, aspect: number, verticalFovDeg: number): number => {
  const halfVertical = ((verticalFovDeg / 2) * Math.PI) / 180;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  return widthKm / 2 / KM_PER_UNIT / Math.tan(halfHorizontal);
};

/**
 * Рівень наближення 0..1 (0: вся Україна, 1: місто) у відстань. Шкала
 * логарифмічна: кожен однаковий крок слайдера наближає в однакову
 * кількість разів, а не на однакову кількість кілометрів.
 */
export const zoomToDistance = (zoom: number, far: number, near: number): number =>
  far * Math.pow(near / far, Math.min(1, Math.max(0, zoom)));

/**
 * Зсув фокуса на екранні пікселі перетягування. Карта їде за пальцем:
 * тягнемо вниз, фокус іде на північ. По вертикалі поверхня стиснута
 * нахилом, тому той самий піксель там означає більше кілометрів.
 */
export const panView = (
  view: MapView,
  dxPx: number,
  dyPx: number,
  viewportHeightPx: number,
  verticalFovDeg: number
): MapView => {
  const halfVertical = ((verticalFovDeg / 2) * Math.PI) / 180;
  const unitsPerPx = (2 * view.distance * Math.tan(halfVertical)) / viewportHeightPx;
  const eastUnits = -dxPx * unitsPerPx;
  const northUnits = (dyPx * unitsPerPx) / Math.max(0.35, Math.cos((view.tilt * Math.PI) / 180));
  const degPerUnit = 180 / Math.PI / GLOBE_RADIUS;
  return clampView({
    ...view,
    lat: view.lat + northUnits * degPerUnit,
    lng: view.lng + (eastUnits * degPerUnit) / Math.cos((view.lat * Math.PI) / 180),
  });
};

/**
 * Висота плато на поточній відстані камери. Здалеку плато помітне, а
 * зблизька ті самі 25 км стінки перетворюються на сині брили над містом,
 * тому висота спадає разом із відстанню, але не нижче `max * minShare`.
 */
export const plateauAltitude = (
  distance: number,
  max: number,
  referenceDistance: number,
  minShare = 0.2
): number => Math.min(max, Math.max(max * minShare, (max * distance) / referenceDistance));

/** Фокус не виходить за межі України: карта про неї, а не про сусідів. */
export const clampView = (view: MapView): MapView => ({
  ...view,
  lat: Math.min(UKRAINE_BOUNDS.latMax, Math.max(UKRAINE_BOUNDS.latMin, view.lat)),
  lng: Math.min(UKRAINE_BOUNDS.lngMax, Math.max(UKRAINE_BOUNDS.lngMin, view.lng)),
});
