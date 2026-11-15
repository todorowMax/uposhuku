// lib/maplibre/place-beside.ts
//
// Де поставити поповер поруч із маркером: праворуч, якщо вміщається, інакше ліворуч; по вертикалі
// по центру маркера, але в межах карти й нижче верхнього краю, який займає поле запиту.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlaceOptions {
  anchor: Box;
  size: { width: number; height: number };
  bounds: { width: number; height: number };
  gap: number;
  margin: number;
  /** Нижче чого поповер не заходить зверху. */
  topEdge: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const placeBeside = ({ anchor, size, bounds, gap, margin, topEdge }: PlaceOptions) => {
  const fitsRight = anchor.left + anchor.width + gap + size.width <= bounds.width - margin;
  const rawLeft = fitsRight ? anchor.left + anchor.width + gap : anchor.left - gap - size.width;
  const left = clamp(rawLeft, margin, Math.max(margin, bounds.width - size.width - margin));
  const rawTop = anchor.top + anchor.height / 2 - size.height / 2;
  const top = clamp(rawTop, topEdge, Math.max(topEdge, bounds.height - size.height - margin));
  return { left, top, side: fitsRight ? ("right" as const) : ("left" as const) };
};
