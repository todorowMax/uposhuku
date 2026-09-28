// lib/globe/markers.ts
//
// Пірамідка виконавця. Той самий знак, що в логотипі: трикутник із двома
// гранями різного тону. Геометрія й матеріал спільні на всі маркери,
// кожен маркер лише окремий Mesh із власною позицією.

import { ConeGeometry, Group, Matrix4, Mesh, type Material } from "three";
import { geoToCartesian, localFrame } from "./camera";
import type { GeoPoint } from "@/lib/map/types";

/** Висота пірамідки відносно ширини основи. */
const ASPECT = 1.6;

export const createPyramidGeometry = () => {
  // Чотири грані: з камери, що дивиться з півдня, видно дві.
  const geometry = new ConeGeometry(0.5, ASPECT, 4, 1);
  // Основа на нулі, вершина вгору: масштаб не відриває маркер від землі.
  geometry.translate(0, ASPECT / 2, 0);
  return geometry;
};

/**
 * Ставить маркер на поверхню й орієнтує: вісь Y уздовж вертикалі місця,
 * ребро пірамідки дивиться на південь, тобто на камеру. Тоді ліва грань
 * світла, права темна, як у знаку.
 */
export const placeOnSurface = (object: Group | Mesh, point: GeoPoint, altitude: number) => {
  const { up, north, east } = localFrame(point.lat, point.lng);
  const south = north.clone().negate();
  object.position.copy(geoToCartesian(point.lat, point.lng, altitude));
  object.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(east, up, south));
};

export const createPyramid = (
  geometry: ConeGeometry,
  material: Material,
  point: GeoPoint,
  altitude: number
) => {
  const mesh = new Mesh(geometry, material);
  placeOnSurface(mesh, point, altitude);
  return mesh;
};
