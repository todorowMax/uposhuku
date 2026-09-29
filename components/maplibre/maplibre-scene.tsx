"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { GlobeZoomControl } from "@/components/globe/zoom-control";
import { createPortraitCanvas } from "@/lib/globe/visual-markers";
import { GLOBE_PALETTE } from "@/lib/globe/palette";
import { BUILDINGS_ZOOM, FONT_BOLD, buildMapStyle } from "@/lib/maplibre/style";
import { DETAIL_ZOOM } from "@/lib/maplibre/static";
import { CITIES } from "@/lib/map/cities";
import { DEMO_PERFORMERS, DEMO_REQUESTS } from "@/lib/map/demo";
import { setMapReady } from "@/lib/map/ready";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Межі України з полями: під них підганяємо камеру на старті. */
const UKRAINE_BOUNDS: [[number, number], [number, number]] = [[22.1, 44.3], [40.3, 52.4]];
const TILT = 38;
/** Далі країни не відпускаємо: карта про Україну. */
const MIN_ZOOM = 4.3;
/** Повзунок «Місто» доходить до кварталів з будинками. */
const CITY_ZOOM = BUILDINGS_ZOOM + 2;
/** Розмір портрета на екрані за рівнем розміщення, CSS-пікселі (як на глобусі). */
const PLACEMENT_PX = { standard: 27, plus: 35, featured: 45 } as const;
/** Полотно портрета 192px, малюємо з pixelRatio 4: логічний розмір 48px. */
const PORTRAIT_RATIO = 4;
const PORTRAIT_LOGICAL = 192 / PORTRAIT_RATIO;

/** Ромб групи: той самий синій градієнт, що на глобусі, число кладе шар підпису. */
const createClusterImage = () => {
  const size = 112;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.translate(size / 2, size / 2);
  context.shadowColor = "rgba(15, 64, 148, .3)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 5;
  context.rotate(Math.PI / 4);
  const gradient = context.createLinearGradient(-30, -30, 30, 30);
  gradient.addColorStop(0, "#72a9ff");
  gradient.addColorStop(0.52, "#2469ef");
  gradient.addColorStop(1, "#1044b5");
  context.fillStyle = gradient;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(-30, -30, 60, 60, 17);
  context.fill();
  context.stroke();
  return context.getImageData(0, 0, size, size);
};

const zoomToSlider = (zoom: number, far: number) => Math.min(1, Math.max(0, (zoom - far) / (CITY_ZOOM - far)));
const sliderToZoom = (value: number, far: number) => far + value * (CITY_ZOOM - far);

export default function MapLibreScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const farZoomRef = useRef(5);
  const [ready, setReady] = useState(false);
  const [slider, setSlider] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Під час наближення догружаються вулиці й будинки з мережі. */
  const [detailLoading, setDetailLoading] = useState(false);

  const people = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: DEMO_PERFORMERS.map((performer) => ({
        type: "Feature",
        id: performer.id,
        geometry: { type: "Point", coordinates: [performer.lng, performer.lat] },
        properties: {
          id: performer.id,
          avatar: `avatar-${performer.avatarIndex % 16}`,
          size: PLACEMENT_PX[performer.placement] / PORTRAIT_LOGICAL,
          rank: performer.placement === "featured" ? 3 : performer.placement === "plus" ? 2 : 1,
        },
      })),
    }),
    []
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style: buildMapStyle(window.location.origin),
      bounds: UKRAINE_BOUNDS,
      fitBoundsOptions: { padding: { top: 190, bottom: 60, left: 40, right: 40 } },
      pitch: TILT,
      minZoom: MIN_ZOOM,
      maxZoom: 17.5,
      maxPitch: 65,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("load", async () => {
      // Точка старту — це й «Україна» на повзунку.
      farZoomRef.current = Math.max(MIN_ZOOM, map.getZoom());

      const source = new Image();
      source.src = "/globe/mock-avatars.png";
      await source.decode();
      for (let index = 0; index < 16; index++) {
        const canvas = createPortraitCanvas(source, index);
        const context = canvas.getContext("2d");
        if (!context) continue;
        map.addImage(`avatar-${index}`, context.getImageData(0, 0, canvas.width, canvas.height), {
          pixelRatio: PORTRAIT_RATIO,
        });
      }
      map.addImage("cluster", createClusterImage(), { pixelRatio: 2 });

      map.addSource("requests", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: DEMO_REQUESTS.map((request) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [request.lng, request.lat] },
            properties: { live: request.live },
          })),
        },
      });
      map.addLayer({
        id: "requests",
        type: "circle",
        source: "requests",
        paint: {
          "circle-color": GLOBE_PALETTE.request,
          "circle-radius": ["case", ["get", "live"], 6, 4.5],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-pitch-alignment": "viewport",
        },
      });

      // Групи — вбудована кластеризація: самі розкриваються при наближенні.
      map.addSource("people", {
        type: "geojson",
        data: people,
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 11,
      });
      map.addLayer({
        id: "people-clusters",
        type: "symbol",
        source: "people",
        filter: ["has", "point_count"],
        layout: {
          "icon-image": "cluster",
          "icon-allow-overlap": true,
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": FONT_BOLD,
          "text-size": 15,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "people",
        type: "symbol",
        source: "people",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["get", "avatar"],
          "icon-size": ["get", "size"],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "symbol-sort-key": ["get", "rank"],
        },
      });

      // Підписи міст після людей: колізія сама ховає підпис, що наїхав би
      // на фото чи ромб. Те, що на глобусі робили руками.
      map.addSource("cities", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: CITIES.filter((city) => city.label).map((city) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [city.lng, city.lat] },
            properties: { name: city.name },
          })),
        },
      });
      map.addLayer({
        id: "cities",
        type: "symbol",
        source: "cities",
        maxzoom: 12,
        layout: {
          "text-field": ["get", "name"],
          "text-font": FONT_BOLD,
          "text-size": 13,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-variable-anchor": ["top", "bottom", "left", "right"],
          "text-radial-offset": 1.2,
        },
        paint: {
          "text-color": "#172033",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });

      map.on("click", "people-clusters", async (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id as number;
        const zoom = await (map.getSource("people") as GeoJSONSource).getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: (feature.geometry as Point).coordinates as [number, number],
          zoom: zoom + 0.3,
          duration: 620,
        });
      });
      map.on("click", "people", (event: MapLayerMouseEvent) => {
        setSelectedId((event.features?.[0]?.properties?.id as string) ?? null);
      });
      for (const layer of ["people", "people-clusters"]) {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }

      setReady(true);
      setMapReady(true);
    });

    const syncSlider = () => setSlider(zoomToSlider(map.getZoom(), farZoomRef.current));
    map.on("zoom", syncSlider);

    // Плашка «Підвантажуємо деталі» лише там, де справді йдемо в мережу:
    // з DETAIL_ZOOM і поки тайли OSM не доїхали.
    map.on("dataloading", () => {
      if (map.getZoom() >= DETAIL_ZOOM && !map.areTilesLoaded()) setDetailLoading(true);
    });
    map.on("idle", () => setDetailLoading(false));

    return () => {
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, [people]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const selected = DEMO_PERFORMERS.find((performer) => performer.id === selectedId);
  const selectedCity = CITIES.find((city) => city.id === selected?.cityId);

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      {/* Обгортка тримає розмір: стилі MapLibre ставлять самій карті
          position: relative і перебивають absolute. */}
      <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: ready ? 1 : 0 }}>
        <div
          ref={containerRef}
          aria-label="Карта виконавців і запитів в Україні"
          role="region"
          className="h-full w-full"
        />
      </div>

      <div
        aria-live="polite"
        className={`pointer-events-none absolute bottom-20 left-1/2 z-[var(--z-controls)] -translate-x-1/2 transition-[opacity,translate] duration-300 sm:bottom-7 ${
          detailLoading ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <div className="flex items-center gap-2.5 rounded-full bg-surface px-4 py-2 text-[13px] font-medium text-ink-muted shadow-[0_8px_28px_-12px_rgb(15_23_40/0.35)] ring-1 ring-line">
          <span aria-hidden className="map-detail-spinner" />
          {detailLoading ? "Підвантажуємо деталі…" : ""}
        </div>
      </div>

      {selected && (
        <div className="absolute bottom-4 left-4 z-[var(--z-controls)] flex w-[300px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-surface p-3 pr-4 shadow-[0_18px_40px_-18px_oklch(0.42_0.09_260/0.35)] ring-1 ring-line sm:bottom-6 sm:left-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">{selected.name}</p>
            <p className="truncate text-[13px] text-ink-muted">{selected.specialty}</p>
            <p className="text-[12px] text-brand">{selectedCity?.name} · демопрофіль</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            aria-label="Закрити"
            className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-bg hover:text-ink"
          >
            ×
          </button>
        </div>
      )}

      <GlobeZoomControl
        value={slider}
        onChange={(value) => mapRef.current?.jumpTo({ zoom: sliderToZoom(value, farZoomRef.current) })}
        onStep={(direction) =>
          mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 0) + direction * 1.2, duration: 320 })
        }
      />
    </div>
  );
}
