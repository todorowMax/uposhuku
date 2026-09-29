import {
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type PerspectiveCamera,
} from "three";
import { geoToCartesian } from "@/lib/globe/camera";
import type { GeoPoint, Performer } from "@/lib/map/types";

export type VisualMarker =
  | ({ kind: "performer"; selected: boolean } & Performer)
  | ({
      kind: "group";
      id: string;
      cityId: string;
      name: string;
      count: number;
      previews: number[];
      expanded: boolean;
    } & GeoPoint);

export interface MarkerAssets {
  portraits: CanvasTexture[];
  groups: Map<string, CanvasTexture>;
  source: HTMLImageElement;
}

const TEXTURE_SIZE = 192;

const textureFrom = (canvas: HTMLCanvasElement) => {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

const canvasContext = () => {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  return { canvas, context };
};

const drawPortrait = (
  context: CanvasRenderingContext2D,
  source: HTMLImageElement,
  index: number,
  x: number,
  y: number,
  radius: number
) => {
  const cell = source.naturalWidth / 4;
  const column = index % 4;
  const row = Math.floor(index / 4) % 4;
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  context.drawImage(source, column * cell, row * cell, cell, cell, x - radius, y - radius, radius * 2, radius * 2);
  context.restore();
};

const createPortraitTexture = (source: HTMLImageElement, index: number) => {
  const { canvas, context } = canvasContext();
  // Фото й маленький якір з'єднані в один «живий» маркер. Контур
  // залишає портрет упізнаваним навіть у найменшому платному рівні.
  context.shadowColor = "rgba(20, 65, 145, .29)";
  context.shadowBlur = 17;
  context.shadowOffsetY = 6;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(96, 83, 72, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  drawPortrait(context, source, index, 96, 83, 65);
  context.strokeStyle = "#ffffff";
  context.lineWidth = 8;
  context.beginPath();
  context.arc(96, 83, 69, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "#2469ef";
  context.lineWidth = 5;
  context.beginPath();
  context.arc(96, 83, 75, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#2469ef";
  context.beginPath();
  context.moveTo(82, 152);
  context.quadraticCurveTo(96, 183, 110, 152);
  context.closePath();
  context.fill();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(96, 162, 4, 0, Math.PI * 2);
  context.fill();
  return textureFrom(canvas);
};

/** Створюємо один локальний атлас портретів, без окремих мережевих запитів. */
export const loadMarkerAssets = async (): Promise<MarkerAssets> => {
  const source = new Image();
  source.src = "/globe/mock-avatars.png";
  await source.decode();
  return {
    portraits: Array.from({ length: 16 }, (_, index) => createPortraitTexture(source, index)),
    groups: new Map(),
    source,
  };
};

export const disposeMarkerAssets = (assets: MarkerAssets) => {
  assets.portraits.forEach((texture) => texture.dispose());
  assets.groups.forEach((texture) => texture.dispose());
};

const createGroupTexture = (assets: MarkerAssets, marker: Extract<VisualMarker, { kind: "group" }>) => {
  const { canvas, context } = canvasContext();
  context.shadowColor = "rgba(15, 64, 148, .25)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 7;
  marker.previews.forEach((index, side) => {
    const x = side === 0 ? 38 : 154;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x, 99, 31, 0, Math.PI * 2);
    context.fill();
    drawPortrait(context, assets.source, index, x, 99, 27);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 5;
    context.beginPath();
    context.arc(x, 99, 29, 0, Math.PI * 2);
    context.stroke();
  });

  // Група — м'який скляний ромб із портретами по боках. Відкрита
  // група лишається на тому самому місці й перетворюється на ×.
  context.save();
  context.translate(96, 91);
  context.rotate(Math.PI / 4);
  const gradient = context.createLinearGradient(-49, -49, 51, 51);
  gradient.addColorStop(0, marker.expanded ? "#68a1ff" : "#72a9ff");
  gradient.addColorStop(0.52, "#2469ef");
  gradient.addColorStop(1, "#1044b5");
  context.fillStyle = gradient;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 7;
  context.beginPath();
  context.roundRect(-49, -49, 98, 98, 27);
  context.fill();
  context.stroke();
  context.restore();
  context.shadowColor = "transparent";
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = marker.expanded ? "600 77px Arial, sans-serif" : "700 58px Arial, sans-serif";
  context.fillText(marker.expanded ? "×" : String(marker.count), 96, marker.expanded ? 85 : 89);
  return textureFrom(canvas);
};

export const markerTexture = (assets: MarkerAssets, marker: VisualMarker) => {
  if (marker.kind === "performer") return assets.portraits[marker.avatarIndex % assets.portraits.length];
  const key = `${marker.cityId}:${marker.expanded}`;
  let texture = assets.groups.get(key);
  if (!texture) {
    texture = createGroupTexture(assets, marker);
    assets.groups.set(key, texture);
  }
  return texture;
};

export const markerPixelSize = (marker: VisualMarker, narrow: boolean) => {
  if (marker.kind === "group") return narrow ? 50 : 56;
  const sizes = narrow ? { standard: 24, plus: 30, featured: 39 } : { standard: 27, plus: 35, featured: 45 };
  return sizes[marker.placement] * (marker.selected ? 1.12 : 1);
};

export const createMarkerSprite = (assets: MarkerAssets, marker: VisualMarker) => {
  const sprite = new Sprite(new SpriteMaterial({
    map: markerTexture(assets, marker),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  sprite.userData.marker = marker;
  if (marker.kind === "performer") sprite.center.set(0.5, 0.12);
  sprite.renderOrder = marker.kind === "group" && marker.expanded ? 30 : 20;
  return sprite;
};

export const placeMarkerSprite = (
  sprite: Sprite,
  camera: PerspectiveCamera,
  viewportHeight: number,
  altitude: number,
  narrow: boolean
) => {
  const marker = sprite.userData.marker as VisualMarker;
  sprite.position.copy(geoToCartesian(marker.lat, marker.lng, altitude + 0.0003));
  // Розмір у пікселях стабільний на кожному масштабі; позиція й масштаб
  // оновлюються в тому самому кадрі, що камера та поверхня планети.
  const distance = camera.position.distanceTo(sprite.position);
  const unitsPerPixel = (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / viewportHeight;
  const side = unitsPerPixel * markerPixelSize(marker, narrow);
  sprite.scale.set(side, side, 1);
};
