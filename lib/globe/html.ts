// Легкі DOM-підписи поверх глобуса; інтерактивні люди й групи — у WebGL.
import type { City, WorkRequest } from "@/lib/map/types";

export type HtmlMarker =
  | ({ kind: "city"; grouped: boolean } & City)
  | ({ kind: "request" } & WorkRequest);

/** Один локальний атлас 4×4 замість десятків мережевих запитів. */
export const avatarPosition = (index: number) => {
  const column = index % 4;
  const row = Math.floor(index / 4) % 4;
  return `${(column / 3) * 100}% ${(row / 3) * 100}%`;
};

export const createMarkerElement = (marker: HtmlMarker): HTMLElement => {
  if (marker.kind === "request") {
    const dot = document.createElement("div");
    dot.className = "globe-request";
    dot.dataset.live = String(marker.live);
    return dot;
  }
  const anchor = document.createElement("div");
  anchor.className = "globe-anchor";
  const label = document.createElement("span");
  label.className = "globe-city";
  label.dataset.side = marker.labelSide ?? "right";
  label.dataset.grouped = String(marker.grouped);
  label.textContent = marker.name;
  anchor.appendChild(label);
  return anchor;
};
