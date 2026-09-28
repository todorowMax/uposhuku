"use client";

import dynamic from "next/dynamic";

/*
 * three.js і globe.gl звертаються до window вже під час імпорту, тож
 * сцену вантажимо тільки в браузері. Обгортка окремим файлом: next/dynamic
 * не прокидає ref, а сцені він потрібен до самого globe.gl.
 */
const GlobeScene = dynamic(() => import("./globe-scene"), { ssr: false });

export function VibeGlobe() {
  return <GlobeScene />;
}
