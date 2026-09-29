"use client";

import dynamic from "next/dynamic";

/*
 * MapLibre звертається до window вже під час імпорту, тож сцену вантажимо
 * тільки в браузері. До того видно серверну заставку (MapSkeleton).
 */
const MapLibreScene = dynamic(() => import("./maplibre-scene"), { ssr: false });

export function VibeMap() {
  return <MapLibreScene />;
}
