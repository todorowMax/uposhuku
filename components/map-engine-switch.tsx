"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { VibeGlobe } from "@/components/globe/vibe-globe";
import { setMapReady } from "@/lib/map/ready";

/*
 * MapLibre звертається до window під час імпорту, як і globe.gl, тож
 * вантажимо тільки в браузері.
 */
const MapLibreScene = dynamic(() => import("./maplibre/maplibre-scene"), { ssr: false });

type Engine = "globe" | "maplibre";

const ENGINES: { id: Engine; label: string }[] = [
  { id: "globe", label: "Глобус" },
  { id: "maplibre", label: "MapLibre" },
];

/**
 * Тимчасовий перемикач для порівняння двох рушіїв карти: поточний глобус
 * на globe.gl і прототип на MapLibre. Вибір живе в адресі (?map=maplibre),
 * щоб можна було кинути посилання. Приберемо, коли оберемо один.
 */
export function MapEngineSwitch() {
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("map");
    setEngine(value === "maplibre" ? "maplibre" : "globe");
  }, []);

  const choose = (next: Engine) => {
    if (next === engine) return;
    // Нова карта ще вантажиться: знову показуємо заставку.
    setMapReady(false);
    setEngine(next);
    const url = new URL(window.location.href);
    if (next === "globe") url.searchParams.delete("map");
    else url.searchParams.set("map", next);
    window.history.replaceState(null, "", url);
  };

  return (
    <>
      {engine === "globe" && <VibeGlobe />}
      {engine === "maplibre" && <MapLibreScene />}

      <div
        role="radiogroup"
        aria-label="Рушій карти"
        className="absolute bottom-20 left-4 z-[var(--z-controls)] flex rounded-full bg-surface p-1 text-[13px] font-medium shadow-[0_8px_28px_-12px_rgb(15_23_40/0.35)] ring-1 ring-line sm:bottom-6 sm:left-20"
      >
        {ENGINES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={engine === item.id}
            onClick={() => choose(item.id)}
            className="rounded-full px-3.5 py-1.5 text-ink-muted transition-colors duration-150 hover:text-ink aria-checked:bg-brand aria-checked:text-brand-ink"
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
