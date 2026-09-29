"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import { MapZoomControl } from "@/components/maplibre/zoom-control";
import { AVATAR_ATLAS, AVATAR_COUNT, PORTRAIT_SIZE, createPortraitCanvas } from "@/lib/map/portrait";
import { MAP_PALETTE } from "@/lib/map/palette";
import { BUILDINGS_ZOOM, FONT_BOLD, UKRAINE_TRACE_RING, buildMapStyle } from "@/lib/maplibre/style";
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
/** Розмір портрета на екрані за рівнем розміщення, CSS-пікселі. */
const PLACEMENT_PX = { standard: 27, plus: 35, featured: 45 } as const;
/** Полотно портрета 192px, малюємо з pixelRatio 4: логічний розмір 48px. */
const PORTRAIT_RATIO = 4;
const PORTRAIT_LOGICAL = PORTRAIT_SIZE / PORTRAIT_RATIO;

// Довжина сегментів потрібна, щоб світлова точка рухалась уздовж контуру
// рівномірно, а не прискорювалась на густіше оцифрованих ділянках.
const traceDistances = UKRAINE_TRACE_RING.map((point, index) => {
  if (index === 0) return 0;
  const previous = UKRAINE_TRACE_RING[index - 1];
  const latitude = ((point[1] + previous[1]) / 2) * Math.PI / 180;
  return Math.hypot((point[0] - previous[0]) * Math.cos(latitude), point[1] - previous[1]);
});
for (let index = 1; index < traceDistances.length; index++) traceDistances[index] += traceDistances[index - 1];
const traceLength = traceDistances[traceDistances.length - 1];
const smoothstep = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Майже рівна швидкість із м'яким прискоренням та гальмуванням. */
const easedTraceProgress = (time: number) => {
  const ramp = 0.16;
  const speed = 1 / (1 - ramp);
  if (time < ramp) return speed * time * time / (2 * ramp);
  if (time > 1 - ramp) return 1 - speed * (1 - time) ** 2 / (2 * ramp);
  return speed * (time - ramp / 2);
};

const pointOnTrace = (progress: number): [number, number] => {
  const distance = progress * traceLength;
  let low = 1;
  let high = traceDistances.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (traceDistances[middle] < distance) low = middle + 1;
    else high = middle;
  }
  const start = UKRAINE_TRACE_RING[low - 1];
  const end = UKRAINE_TRACE_RING[low];
  const span = traceDistances[low] - traceDistances[low - 1];
  const fraction = span ? (distance - traceDistances[low - 1]) / span : 0;
  return [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
};

const traceGradient = (progress: number, glow: boolean) => {
  // Відстань позаду точки зациклюється на стику першої та останньої координати.
  const behind: ExpressionSpecification = ["%", ["+", ["-", progress, ["line-progress"]], 1], 1];
  return ["interpolate", ["linear"], behind,
    0, glow ? "rgba(255,238,201,.7)" : "rgba(255,251,231,1)",
    glow ? 0.09 : 0.075, glow ? "rgba(255,215,171,.32)" : "rgba(255,240,215,.38)",
    glow ? 0.23 : 0.19, "rgba(255,240,215,0)",
    1, "rgba(255,240,215,0)",
  ] as ExpressionSpecification;
};

const demoMetric = (id: string, salt: number) => {
  let value = salt;
  for (const character of id) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value;
};

/** Група з трьома портретами на темному диску, як у референсі. */
const createClusterImage = (source: HTMLImageElement, variant: number) => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.scale(size / 144, size / 144);
  context.shadowColor = "rgba(42, 51, 55, .25)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 7;
  context.fillStyle = "#24282a";
  context.beginPath();
  context.arc(72, 69, 58, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";

  const cell = source.naturalWidth / 4;
  const previews = [[1, 6, 10], [3, 8, 12], [0, 7, 14], [4, 9, 15]];
  const portraits = [
    { x: 48, y: 47, radius: 23 },
    { x: 98, y: 51, radius: 19 },
    { x: 75, y: 96, radius: 26 },
  ];
  for (const [position, { x, y, radius }] of portraits.entries()) {
    const index = previews[variant][position];
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
      source, (index % 4) * cell, Math.floor(index / 4) * cell, cell, cell,
      x - radius, y - radius, radius * 2, radius * 2
    );
    context.restore();
    context.strokeStyle = "#eef1f1";
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
  }
  return context.getImageData(0, 0, size, size);
};

const zoomToSlider = (zoom: number, far: number) => Math.min(1, Math.max(0, (zoom - far) / (CITY_ZOOM - far)));
const sliderToZoom = (value: number, far: number) => far + value * (CITY_ZOOM - far);

export default function MapLibreScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const avatarAtlasRef = useRef<HTMLImageElement | null>(null);
  const farZoomRef = useRef(5);
  const [ready, setReady] = useState(false);
  const [slider, setSlider] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardNotice, setCardNotice] = useState<string | null>(null);
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
          avatar: `avatar-${performer.avatarIndex % AVATAR_COUNT}`,
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
    let traceFrame = 0;
    let traceStart = 0;
    let lastTraceFrame = 0;

    const animateTrace = (timestamp: number) => {
      if (!traceStart) traceStart = timestamp;
      if (timestamp - lastTraceFrame >= 32) {
        lastTraceFrame = timestamp;
        const cycle = (timestamp - traceStart) % 9800;
        const moving = cycle < 4800;
        const travelTime = Math.min(cycle / 4800, 1);
        const progress = Math.min(easedTraceProgress(travelTime), 0.99999);
        const fade = moving ? smoothstep(travelTime / 0.08) : 1 - smoothstep((cycle - 4800) / 1600);
        const dotFade = moving ? smoothstep(travelTime / 0.07) * smoothstep((1 - travelTime) / 0.09) : 0;
        map.setPaintProperty("ukraine-trace-glow", "line-gradient", traceGradient(progress, true));
        map.setPaintProperty("ukraine-trace-core", "line-gradient", traceGradient(progress, false));
        map.setPaintProperty("ukraine-trace-glow", "line-opacity", 0.62 * fade);
        map.setPaintProperty("ukraine-trace-core", "line-opacity", 0.95 * fade);
        map.setPaintProperty("ukraine-trace-dot", "circle-opacity", 0.95 * dotFade);
        map.setPaintProperty("ukraine-outline", "line-opacity", 0.28 + 0.14 * fade);
        (map.getSource("ukraine-trace-head") as GeoJSONSource).setData({
          type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pointOnTrace(progress) },
        });
      }
      traceFrame = requestAnimationFrame(animateTrace);
    };

    map.on("load", async () => {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        traceFrame = requestAnimationFrame(animateTrace);
      }
      // Точка старту — це й «Україна» на повзунку.
      farZoomRef.current = Math.max(MIN_ZOOM, map.getZoom());

      const source = new Image();
      source.src = AVATAR_ATLAS;
      await source.decode();
      avatarAtlasRef.current = source;
      for (let index = 0; index < AVATAR_COUNT; index++) {
        const canvas = createPortraitCanvas(source, index);
        const context = canvas.getContext("2d");
        if (!context) continue;
        map.addImage(`avatar-${index}`, context.getImageData(0, 0, canvas.width, canvas.height), {
          pixelRatio: PORTRAIT_RATIO,
        });
      }
      const activeCanvas = document.createElement("canvas");
      activeCanvas.width = 256;
      activeCanvas.height = 256;
      const activeContext = activeCanvas.getContext("2d");
      if (activeContext) map.addImage("active-avatar", activeContext.getImageData(0, 0, 256, 256), { pixelRatio: PORTRAIT_RATIO });
      for (let variant = 0; variant < 4; variant++) {
        map.addImage(`cluster-${variant}`, createClusterImage(source, variant), { pixelRatio: 2 });
      }

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
          "circle-color": MAP_PALETTE.request,
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
          "icon-image": ["concat", "cluster-", ["to-string", ["%", ["get", "cluster_id"], 4]]],
          "icon-allow-overlap": true,
        },
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
      map.addLayer({
        id: "people-selected",
        type: "symbol",
        source: "people",
        filter: ["==", ["get", "id"], "__none__"],
        layout: {
          "icon-image": "active-avatar",
          "icon-size": ["get", "size"],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
        },
        paint: { "icon-opacity": 1 },
      });

      // Підписи міст після людей: колізія сама ховає підпис, що наїхав би
      // на фото чи ромб.
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
          "text-color": "#374447",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });

      map.on("click", "people-clusters", async (event: MapLayerMouseEvent) => {
        setSelectedId(null);
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
      const selectPerson = (event: MapLayerMouseEvent) => {
        setSelectedId((event.features?.[0]?.properties?.id as string) ?? null);
        setCardNotice(null);
      };
      map.on("click", "people", selectPerson);
      map.on("click", "people-selected", selectPerson);
      for (const layer of ["people", "people-selected", "people-clusters"]) {
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
      cancelAnimationFrame(traceFrame);
      setMapReady(false);
      map.remove();
      mapRef.current = null;
      avatarAtlasRef.current = null;
    };
  }, [people]);

  useEffect(() => {
    const map = mapRef.current;
    const atlas = avatarAtlasRef.current;
    if (!ready || !map?.getLayer("people-selected") || !atlas) return;
    let frame = 0;
    if (selectedId) {
      const performer = DEMO_PERFORMERS.find((person) => person.id === selectedId);
      if (!performer) return;
      const base = createPortraitCanvas(atlas, performer.avatarIndex, true);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) return;
      map.setFilter("people-selected", ["==", ["get", "id"], selectedId]);
      const start = performance.now();
      const animate = (now: number) => {
        const progress = Math.min((now - start) / 420, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        context.clearRect(0, 0, 256, 256);
        context.save();
        context.translate(128, 256);
        context.scale(1 + eased * 0.3, 1 + eased * 0.3);
        context.globalAlpha = eased;
        context.drawImage(base, -96, -192);
        context.restore();
        map.updateImage("active-avatar", context.getImageData(0, 0, 256, 256));
        if (progress < 1) frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    } else {
      map.setFilter("people-selected", ["==", ["get", "id"], "__none__"]);
    }
    return () => cancelAnimationFrame(frame);
  }, [ready, selectedId]);

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
  const avatarColumn = selected ? selected.avatarIndex % 4 : 0;
  const avatarRow = selected ? Math.floor(selected.avatarIndex / 4) : 0;
  const months = selected ? 3 + demoMetric(selected.id, 17) % 23 : 0;
  const orders = selected ? 4 + demoMetric(selected.id, 31) % 55 : 0;
  const rating = selected ? (4.7 + (demoMetric(selected.id, 73) % 4) / 10).toFixed(1) : "";

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
        <div className="glass-panel flex items-center gap-2.5 rounded-full px-4 py-2 text-[13px] font-medium text-ink-muted">
          <span aria-hidden className="map-detail-spinner" />
          {detailLoading ? "Підвантажуємо деталі…" : ""}
        </div>
      </div>

      {selected && (
        <aside className="glass-panel absolute inset-x-3 bottom-20 z-[var(--z-controls)] rounded-[22px] p-5 shadow-[0_18px_55px_rgba(45,60,67,.16)] sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-36 sm:w-[310px]" aria-label={`Картка виконавця ${selected.name}`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="size-16 shrink-0 rounded-2xl bg-[#e6e9e7] bg-no-repeat shadow-[inset_0_0_0_1px_rgba(255,255,255,.6)]" style={{ backgroundImage: `url(${AVATAR_ATLAS})`, backgroundSize: "400% 400%", backgroundPosition: `${avatarColumn * 100 / 3}% ${avatarRow * 100 / 3}%` }} role="img" aria-label={`Фото ${selected.name}`} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold leading-tight text-ink">{selected.name}</p>
                <p className="mt-1 text-[12px] leading-snug text-ink-muted">{selected.specialty}</p>
                <p className="mt-1 text-[11px] text-ink-muted">{selectedCity?.name}</p>
              </div>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Закрити картку" className="grid size-7 shrink-0 place-items-center rounded-full bg-white/65 text-[19px] leading-none text-ink-muted transition-colors hover:bg-white hover:text-ink">×</button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[#b8c4c7]/55 rounded-2xl bg-white/45 py-3 text-center">
            <div><p className="text-[16px] font-semibold text-ink">{months} міс.</p><p className="mt-0.5 text-[10px] text-ink-muted">на платформі</p></div>
            <div><p className="text-[16px] font-semibold text-ink">{orders}</p><p className="mt-0.5 text-[10px] text-ink-muted">замовлень</p></div>
            <div><p className="text-[16px] font-semibold text-ink">★ {rating}</p><p className="mt-0.5 text-[10px] text-ink-muted">рейтинг</p></div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={() => setCardNotice("Повний профіль з’явиться після підключення акаунтів.")} className="min-h-10 w-full rounded-2xl border border-[#b8c4c7] bg-white/75 px-4 text-[12px] font-medium text-ink shadow-[0_1px_2px_rgba(42,53,57,.05)] transition-colors hover:border-[#87999e] hover:bg-white">Переглянути профіль</button>
            <button type="button" onClick={() => { document.getElementById("request")?.focus(); setCardNotice("Опишіть роботу в полі запиту."); }} className="min-h-10 w-full rounded-2xl bg-[#303638] px-4 text-[12px] font-medium text-white transition-colors hover:bg-[#4c5558]">Запропонувати роботу</button>
          </div>
          <p aria-live="polite" className="mt-3 min-h-4 text-[10px] text-ink-muted/75">{cardNotice ?? "Демонстраційні дані профілю"}</p>
        </aside>
      )}

      <MapZoomControl
        value={slider}
        onChange={(value) => mapRef.current?.jumpTo({ zoom: sliderToZoom(value, farZoomRef.current) })}
        onStep={(direction) =>
          mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 0) + direction * 1.2, duration: 320 })
        }
      />
    </div>
  );
}
