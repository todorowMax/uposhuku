// lib/globe/html.ts
//
// DOM-вузли для шару htmlElements у globe.gl: підписи міст, плашка
// «Україна» і крапки запитів. globe.gl центрує вузол на точці, тому
// підпис міста сидить усередині нульового якоря й відсувається вбік
// стилями, а сам якір стоїть рівно на координатах.

import type { City, GeoPoint, WorkRequest } from "@/lib/map/types";

export type HtmlMarker =
  | ({ kind: "city" } & City)
  | ({ kind: "country"; id: string; name: string } & GeoPoint)
  | ({ kind: "request" } & WorkRequest);

export const createMarkerElement = (marker: HtmlMarker): HTMLElement => {
  if (marker.kind === "request") {
    const dot = document.createElement("div");
    dot.className = "globe-request";
    dot.dataset.live = String(marker.live);
    return dot;
  }
  if (marker.kind === "country") {
    const pill = document.createElement("div");
    pill.className = "globe-country";
    pill.textContent = marker.name;
    return pill;
  }
  const anchor = document.createElement("div");
  anchor.className = "globe-anchor";
  const label = document.createElement("span");
  label.className = "globe-city";
  label.dataset.side = marker.labelSide ?? "right";
  label.textContent = marker.name;
  anchor.appendChild(label);
  return anchor;
};
