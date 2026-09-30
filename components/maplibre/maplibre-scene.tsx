"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import { gsap } from "gsap";
import type { FeatureCollection, Point } from "geojson";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import { ChevronRight } from "lucide-react";
import { MapZoomControl } from "@/components/maplibre/zoom-control";
import { PerformerAbout } from "@/components/maplibre/performer-about";
import { AVATAR_ATLAS, AVATAR_COUNT, PORTRAIT_SIZE, createPortraitCanvas } from "@/lib/map/portrait";
import { MAP_PALETTE } from "@/lib/map/palette";
import { BUILDINGS_ZOOM, FONT_BOLD, UKRAINE_TRACE_RING, buildMapStyle } from "@/lib/maplibre/style";
import { DETAIL_ZOOM } from "@/lib/maplibre/static";
import { CITIES } from "@/lib/map/cities";
import { DEMO_PERFORMERS, DEMO_REQUESTS } from "@/lib/map/demo";
import { setMapReady } from "@/lib/map/ready";
import { getRequestTags, getServerRequestTags, subscribeRequestTags } from "@/lib/map/request-tags";
import type { Performer } from "@/lib/map/types";
import { cityFilter, groupFilter, matchInfoStore, onlineFilter, tagMatches, useStore } from "@/lib/map/filters";
import { filterPerformers } from "@/lib/map/groups";
import { focusPerformerStore } from "@/lib/requests/offers";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Межі України з полями: під них підганяємо камеру на старті. */
const UKRAINE_BOUNDS: [[number, number], [number, number]] = [[22.1, 44.3], [40.3, 52.4]];
const TILT = 38;
/** Далі країни не відпускаємо: карта про Україну. */
const MIN_ZOOM = 4.3;
const MAX_ZOOM = 17.5;
/** Наскільки можна відсунутися від стартового кадру «вся Україна». */
const ZOOM_OUT_SLACK = 0.35;
/**
 * Наскільки центр камери може відійти від стартового, градуси. Здалеку
 * країна тримається в кадрі, зблизька (на 2+ рівні ближче) можна
 * дійти до будь-якого кута України, але не до сусідів.
 */
const PAN_SLACK = { far: { lng: 2.5, lat: 1.5 }, near: { lng: 10, lat: 4.5 } };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
/** Повзунок «Місто» доходить до кварталів з будинками. */
const CITY_ZOOM = BUILDINGS_ZOOM + 2;
/**
 * Розмір портрета на екрані за рівнем розміщення 1–6, CSS-пікселі.
 * Кроки ростуть разом із розміром, щоб сусідні рівні розрізнялися на око.
 */
const TIER_PX = [25, 29, 33, 37, 42, 48] as const;
const tierPx = (performer: Performer) => TIER_PX[performer.tier - 1];
/** Наскільки портрет виростає під курсором. */
const HOVER_SCALE = 1.25;
const CLUSTER_HOVER_SCALE = 1.1;
/** Картинка групи: полотно 160×140 з pixelRatio 1.5. */
const CLUSTER_W = 160;
const CLUSTER_H = 140;
const CLUSTER_RATIO = 1.5;
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

/** Демо-статистика профілю: стабільна для людини, поки немає бекенду. */
const demoStats = (performer: Performer) => ({
  months: 3 + demoMetric(performer.id, 17) % 23,
  orders: 4 + demoMetric(performer.id, 31) % 55,
  rating: (4.7 + (demoMetric(performer.id, 73) % 4) / 10).toFixed(1),
});

/** Три цифри профілю з роздільниками: у картці виконавця й у списку групи. */
function ProfileStats({ performer, compact = false }: { performer: Performer; compact?: boolean }) {
  const { months, orders, rating } = demoStats(performer);
  const value = compact ? "text-[14px] font-semibold text-ink" : "text-[16px] font-semibold text-ink";
  return (
    <div className={`grid grid-cols-3 divide-x divide-[#b8c4c7]/55 rounded-2xl bg-white/45 text-center ${compact ? "py-2" : "py-3"}`}>
      <div><p className={value}>{months} міс.</p><p className="mt-0.5 text-[10px] text-ink-muted">на платформі</p></div>
      <div><p className={value}>{orders}</p><p className="mt-0.5 text-[10px] text-ink-muted">замовлень</p></div>
      <div><p className={value}>★ {rating}</p><p className="mt-0.5 text-[10px] text-ink-muted">рейтинг</p></div>
    </div>
  );
}

/**
 * Хто в групі, одним рядком: кожна людина — два символи, рівень і номер
 * обличчя в атласі («3a»). Рядок складає сама кластеризація MapLibre
 * (clusterProperties), тож у групі видно саме тих, хто в ній є, а не
 * випадкові обличчя: розкрив групу — побачив тих самих людей.
 */
const personFace = (performer: Performer) => `${performer.tier}${(performer.avatarIndex % AVATAR_COUNT).toString(16)}`;

/** Обличчя для картинки групи: спершу вищий рівень розміщення, без повторів. */
const clusterFaces = (faces: string) => {
  const people: { tier: number; avatar: number }[] = [];
  for (let index = 0; index + 1 < faces.length; index += 2) {
    people.push({ tier: Number(faces[index]), avatar: parseInt(faces[index + 1], 16) });
  }
  const unique = [...new Set(people.sort((a, b) => b.tier - a.tier).map((person) => person.avatar))];
  return { count: people.length, avatars: unique.slice(0, 5) };
};

/**
 * Група без підкладки: до трьох портретів упритул і кілька маленьких облич
 * та крапок довкола, ніби компанія розходиться. Число людей — у білому
 * кружечку збоку. Найбільший портрет — у того, хто вище в розміщенні.
 * Малюємо на вимогу, бо картинка залежить від складу групи.
 */
const createClusterImage = (source: HTMLImageElement, faces: string) => {
  const { count, avatars } = clusterFaces(faces);
  const width = CLUSTER_W;
  const height = CLUSTER_H;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  const cell = source.naturalWidth / 4;

  const face = (index: number, x: number, y: number, radius: number, ring: number) => {
    context.save();
    context.shadowColor = "rgba(48, 68, 64, .24)";
    context.shadowBlur = radius > 15 ? 10 : 6;
    context.shadowOffsetY = radius > 15 ? 4 : 2;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(x, y, radius + ring, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.clip();
    context.drawImage(source, (index % 4) * cell, Math.floor(index / 4) * cell, cell, cell, x - radius, y - radius, radius * 2, radius * 2);
    context.restore();
  };
  const dot = (x: number, y: number, radius: number) => {
    context.fillStyle = "rgba(255, 255, 255, .92)";
    context.strokeStyle = "#a3bdb0";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  };

  // Облич не більше, ніж людей: двоє — це два портрети, а не три.
  const main = Math.min(avatars.length, 3);
  const small = Math.min(avatars.length - main, count >= 5 ? 2 : count === 4 ? 1 : 0);
  // Крапки й маленькі обличчя — ті, хто «відходить» від групи.
  if (count >= 6) {
    dot(18, 58, 4);
    dot(142, 34, 3.5);
    dot(50, 126, 3);
  }
  if (small >= 1) face(avatars[3], 26, 94, 10, 2.5);
  if (small >= 2) face(avatars[4], 136, 88, 9, 2.5);
  // Головні портрети: перший у списку — найбільший і спереду.
  if (main >= 2) face(avatars[1], 58, 56, 24, 3.5);
  if (main >= 3) face(avatars[2], 104, 50, 20, 3.5);
  face(avatars[0], 84, 94, 27, 3.5);

  // Число — лише коли людей більше, ніж облич на картинці.
  if (count <= main + small) return canvas;
  const label = count > 99 ? "99+" : String(count);
  context.save();
  context.shadowColor = "rgba(48, 68, 64, .22)";
  context.shadowBlur = 6;
  context.shadowOffsetY = 2;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(126, 120, 15, 0, Math.PI * 2);
  context.fill();
  context.restore();
  context.fillStyle = "#30363a";
  context.font = `600 ${label.length > 2 ? 12 : 15}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 126, 121);
  return canvas;
};

interface GroupPreview {
  key: string;
  members: Performer[];
  /** Збільшена група на екрані, px відносно карти. */
  box: { left: number; top: number; width: number; height: number };
}

/** Портрет у списку групи: теж більший у вищого рівня, але стриманіше, ніж на карті. */
const LIST_PX = [26, 29, 32, 35, 39, 44] as const;

/** «1 людина», «3 людини», «12 людей». */
const peopleCount = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return `${count} людина`;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${count} людини`;
  return `${count} людей`;
};

/**
 * Нижче чого панель над картою не заходить зверху: поле запиту, картка
 * запиту й фільтри — лише якщо вона під ними по ширині.
 */
const topEdgeUnderStack = (bounds: DOMRect, left: number, width: number) => {
  let edge = 104;
  for (const item of document.querySelector("[data-top-stack]")?.children ?? []) {
    const box = item.getBoundingClientRect();
    if (box.height && box.right - bounds.left > left && box.left - bounds.left < left + width) {
      edge = Math.max(edge, box.bottom - bounds.top + 12);
    }
  }
  return edge;
};

const toPeople = (performers: Performer[]): FeatureCollection<Point> => ({
  type: "FeatureCollection",
  features: performers.map((performer) => ({
    type: "Feature",
    id: performer.id,
    geometry: { type: "Point", coordinates: [performer.lng, performer.lat] },
    properties: {
      id: performer.id,
      avatar: `avatar-${performer.avatarIndex % AVATAR_COUNT}`,
      size: tierPx(performer) / PORTRAIT_LOGICAL,
      rank: performer.tier,
      face: personFace(performer),
    },
  })),
});
const ALL_PEOPLE = toPeople(DEMO_PERFORMERS);

/**
 * Символи MapLibre далі від камери менші: розмір множиться на
 * 0.5 + 0.5 · (відстань до центру / відстань до точки). Відношення
 * відстаней беремо з того, наскільки коротшає на екрані однаковий
 * відрізок землі в точці порівняно з центром кадру.
 */
const perspectiveAt = (map: MapLibreMap, [lng, lat]: [number, number]) => {
  const groundPx = (atLng: number, atLat: number) => {
    const half = 0.01 / Math.max(0.2, Math.cos(atLat * Math.PI / 180));
    const a = map.project([atLng - half, atLat]);
    const b = map.project([atLng + half, atLat]);
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  const center = map.getCenter();
  const atCenter = groundPx(center.lng, center.lat);
  return atCenter ? clamp(0.5 + 0.5 * groundPx(lng, lat) / atCenter, 0.5, 2) : 1;
};

const zoomToSlider = (zoom: number, far: number) => Math.min(1, Math.max(0, (zoom - far) / (CITY_ZOOM - far)));
const sliderToZoom = (value: number, far: number) => far + value * (CITY_ZOOM - far);

export default function MapLibreScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const avatarAtlasRef = useRef<HTMLImageElement | null>(null);
  const farZoomRef = useRef(5);
  const minZoomRef = useRef(MIN_ZOOM);
  /** Стартовий кадр: від нього рахуються межі руху. До завантаження — центр України. */
  const homeRef = useRef({ lng: 31.2, lat: 48.4, zoom: 5 });
  const cardRef = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const [slider, setSlider] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardNotice, setCardNotice] = useState<string | null>(null);
  /** Під час наближення догружаються вулиці й будинки з мережі. */
  const [detailLoading, setDetailLoading] = useState(false);

  const lensRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  /**
   * Керування збільшеною копією маркера ззовні ефекту карти: сховати, коли
   * змінився склад карти, і не ховати, поки курсор у списку групи.
   */
  const lensControlRef = useRef({ hide: (_instant?: boolean) => {}, enterPanel: () => {}, leavePanel: () => {} });
  /** Список людей групи під курсором і де стоїть сама група на екрані. */
  const [groupPreview, setGroupPreview] = useState<GroupPreview | null>(null);
  /** Людина зі списку групи під курсором: поруч зі списком її коротка статистика. */
  const [peek, setPeek] = useState<{ performer: Performer; top: number; side: "left" | "right" } | null>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const peekShownRef = useRef(false);
  /** Теги з поля запиту: карта лишає лише тих, хто під них підходить. */
  const requestTags = useSyncExternalStore(subscribeRequestTags, getRequestTags, getServerRequestTags);
  const matches = useStore(tagMatches);
  const groups = useStore(groupFilter);
  const cities = useStore(cityFilter);
  const online = useStore(onlineFilter);

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
      maxZoom: MAX_ZOOM,
      maxPitch: 65,
      attributionControl: { compact: true },
      // У проєкції глобуса maxBounds не діє, тож межі задаємо самі.
      transformConstrain: (lngLat, zoom) => {
        const home = homeRef.current;
        const t = clamp((zoom - home.zoom) / 2, 0, 1);
        const lngSlack = lerp(PAN_SLACK.far.lng, PAN_SLACK.near.lng, t);
        const latSlack = lerp(PAN_SLACK.far.lat, PAN_SLACK.near.lat, t);
        return {
          center: new maplibregl.LngLat(
            clamp(lngLat.lng, home.lng - lngSlack, home.lng + lngSlack),
            clamp(lngLat.lat, home.lat - latSlack, home.lat + latSlack)
          ),
          zoom: clamp(zoom, minZoomRef.current, MAX_ZOOM),
        };
      },
    });
    mapRef.current = map;
    // Нахил і поворот фіксовані: карта про Україну, крутити її нема сенсу.
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
    map.keyboard.disableRotation();
    let traceFrame = 0;
    let traceStart = 0;
    let lastTraceFrame = 0;
    /** У паузі між обльотами все вже згасло: перемальовувати карту нема чого. */
    let traceResting = false;

    const animateTrace = (timestamp: number) => {
      if (!traceStart) traceStart = timestamp;
      if (timestamp - lastTraceFrame >= 32) {
        lastTraceFrame = timestamp;
        const cycle = (timestamp - traceStart) % 9800;
        const moving = cycle < 4800;
        const resting = !moving && cycle > 4800 + 1600;
        if (resting && traceResting) {
          traceFrame = requestAnimationFrame(animateTrace);
          return;
        }
        traceResting = resting;
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
      minZoomRef.current = Math.max(MIN_ZOOM, farZoomRef.current - ZOOM_OUT_SLACK);
      const home = map.getCenter();
      homeRef.current = { lng: home.lng, lat: home.lat, zoom: farZoomRef.current };
      map.setMinZoom(minZoomRef.current);

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
      // Картинка групи залежить від числа людей, тож малюємо її, коли MapLibre попросить.
      map.setMissingStyleImageResolver((id) => {
        const match = /^cluster-((?:[1-6][0-9a-f])+)$/.exec(id);
        if (!match || map.hasImage(id)) return;
        const canvas = createClusterImage(source, match[1]);
        const context = canvas.getContext("2d");
        if (context) map.addImage(id, context.getImageData(0, 0, CLUSTER_W, CLUSTER_H), { pixelRatio: CLUSTER_RATIO });
      });

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
        data: ALL_PEOPLE,
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 11,
        // Склад групи рядком облич, див. personFace.
        clusterProperties: { faces: [["concat", ["accumulated"], ["get", "faces"]], ["get", "face"]] },
      });
      map.addLayer({
        id: "people-clusters",
        type: "symbol",
        source: "people",
        filter: ["has", "point_count"],
        layout: {
          "icon-image": ["concat", "cluster-", ["get", "faces"]],
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

      const expandCluster = async (feature: MapGeoJSONFeature) => {
        setSelectedId(null);
        const clusterId = feature.properties?.cluster_id as number;
        const zoom = await (map.getSource("people") as GeoJSONSource).getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: (feature.geometry as Point).coordinates as [number, number],
          zoom: zoom + 0.3,
          duration: 620,
        });
      };
      const selectPerson = (feature: MapGeoJSONFeature | undefined) => {
        setSelectedId((feature?.properties?.id as string) ?? null);
        setCardNotice(null);
      };
      for (const layer of ["people", "people-selected", "people-clusters"]) {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }

      /*
       * Під курсором портрет виростає й стає поверх усього, навіть підписів
       * міст: інакше незрозуміло, чи маркер «почув» наведення, і легко
       * клацнути в назву міста. Символи MapLibre малюються на полотні, тож
       * анімувати їх GSAP не можна. Кладемо над маркером його копію в DOM
       * того ж розміру й збільшуємо вже її; клік по копії — клік по маркеру.
       */
      const lens = lensRef.current;
      const lensImage = lens?.querySelector("img");
      const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const lensUrls = new Map<string, string>();
      let lensFeature: MapGeoJSONFeature | null = null;
      let lensKey = "";

      const lensUrl = (key: string, draw: () => HTMLCanvasElement) => {
        let url = lensUrls.get(key);
        if (!url) {
          url = draw().toDataURL();
          lensUrls.set(key, url);
        }
        return url;
      };
      /*
       * Ховаємо з маленькою затримкою: з групи курсор іде в її список, і
       * по дорозі перетинає кілька пікселів карти. Поки курсор у списку,
       * не ховаємо взагалі: браузер шле «пішов з карти» вже після «зайшов
       * у список», і без цього прапорця список зникав з-під курсора.
       */
      let hideTimer = 0;
      let switchTimer = 0;
      let panelHovered = false;
      /** Відкритий список групи: на інший маркер по дорозі до нього не перемикаємось одразу. */
      let groupOpen = false;
      /** Маркер, на який перемкнемось, якщо курсор на ньому затримається. */
      let pendingKey = "";
      let lastPointer = { x: 0, y: 0 };
      const keepLens = () => window.clearTimeout(hideTimer);
      const releaseLens = () => {
        window.clearTimeout(switchTimer);
        if (panelHovered) return;
        keepLens();
        hideTimer = window.setTimeout(() => hideLens(), 220);
      };
      const hideLens = (instant = false) => {
        keepLens();
        window.clearTimeout(switchTimer);
        pendingKey = "";
        panelHovered = false;
        groupOpen = false;
        setGroupPreview(null);
        if (!lens || !lensFeature) return;
        lensFeature = null;
        lensKey = "";
        gsap.killTweensOf(lens);
        if (instant || reducedMotion) {
          lens.hidden = true;
          return;
        }
        gsap.to(lens, {
          scale: 1, opacity: 0, duration: 0.14, ease: "power1.in",
          onComplete: () => { lens.hidden = true; },
        });
      };
      lensControlRef.current = {
        hide: hideLens,
        enterPanel: () => {
          panelHovered = true;
          keepLens();
          window.clearTimeout(switchTimer);
        },
        leavePanel: () => {
          panelHovered = false;
          releaseLens();
        },
      };
      /*
       * Картинка групи — прямокутник із прозорими краями, і сусідні групи
       * перекривають одна одну. Беремо ту, чий видимий центр ближче до
       * курсора, а не ту, що намальована зверху.
       */
      const nearestMarker = (features: MapGeoJSONFeature[], x: number, y: number) => {
        let best: MapGeoJSONFeature | undefined;
        let bestDistance = Infinity;
        for (const feature of features) {
          const point = map.project((feature.geometry as Point).coordinates as [number, number]);
          // Портрет стоїть на точці нижнім краєм: його центр вище точки.
          const lift = feature.layer.id === "people-clusters" ? 0 : Number(feature.properties?.size ?? 1) * PORTRAIT_LOGICAL * 0.57;
          const distance = Math.hypot(point.x - x, point.y - lift - y);
          if (distance < bestDistance) {
            best = feature;
            bestDistance = distance;
          }
        }
        return best;
      };
      const featureKey = (feature: MapGeoJSONFeature) =>
        feature.layer.id === "people-clusters" ? `cluster-${feature.properties?.faces}` : `person-${feature.properties?.id}`;
      /** Курсор рухається до відкритого списку групи і вже майже навпроти нього. */
      const headingToPanel = (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const panel = groupRef.current;
        const container = containerRef.current;
        if (!panel || !container) return false;
        const box = panel.getBoundingClientRect();
        const origin = container.getBoundingClientRect();
        const left = box.left - origin.left;
        const right = box.right - origin.left;
        const top = box.top - origin.top - 40;
        const bottom = box.bottom - origin.top + 40;
        if (to.y < top || to.y > bottom) return false;
        const dx = to.x - from.x;
        return (to.x < left && dx > 0) || (to.x > right && dx < 0);
      };
      const showLens = (feature: MapGeoJSONFeature) => {
        if (!lens || !lensImage) return;
        const cluster = feature.layer.id === "people-clusters";
        const key = featureKey(feature);
        keepLens();
        if (key === lensKey) return;
        lensFeature = feature;
        lensKey = key;
        const coordinates = (feature.geometry as Point).coordinates as [number, number];
        const point = map.project(coordinates);
        const scale = perspectiveAt(map, coordinates);
        let width: number;
        let height: number;
        if (cluster) {
          width = (CLUSTER_W / CLUSTER_RATIO) * scale;
          height = (CLUSTER_H / CLUSTER_RATIO) * scale;
          lensImage.src = lensUrl(key, () => createClusterImage(source, String(feature.properties?.faces ?? "")));
        } else {
          width = height = Number(feature.properties?.size ?? 1) * PORTRAIT_LOGICAL * scale;
          const avatar = String(feature.properties?.avatar ?? "avatar-0");
          lensImage.src = lensUrl(avatar, () => createPortraitCanvas(source, Number(avatar.slice(7))));
        }
        Object.assign(lens.style, {
          width: `${width}px`,
          height: `${height}px`,
          left: `${point.x - width / 2}px`,
          // Портрет стоїть на точці нижнім краєм, група — центром.
          top: `${cluster ? point.y - height / 2 : point.y - height}px`,
          transformOrigin: cluster ? "50% 50%" : "50% 100%",
        });
        lens.dataset.kind = cluster ? "cluster" : "person";
        lens.hidden = false;
        gsap.killTweensOf(lens);
        const target = cluster ? CLUSTER_HOVER_SCALE : HOVER_SCALE;
        if (reducedMotion) gsap.set(lens, { scale: target, opacity: 1 });
        else gsap.fromTo(lens, { scale: 1, opacity: 1 }, { scale: target, duration: 0.32, ease: "back.out(2.6)" });

        // Для групи поруч список її людей: спершу вищий рівень розміщення.
        groupOpen = false;
        setGroupPreview(null);
        if (!cluster) return;
        const box = {
          left: point.x - (width * target) / 2,
          top: point.y - (height * target) / 2,
          width: width * target,
          height: height * target,
        };
        void (map.getSource("people") as GeoJSONSource)
          .getClusterLeaves(feature.properties?.cluster_id as number, Infinity, 0)
          // Групу вже перерахували (змінився фільтр) — просто без списку.
          .catch(() => [])
          .then((leaves) => {
            if (lensKey !== key) return;
            const ids = new Set(leaves.map((leaf) => leaf.properties?.id as string));
            const members = DEMO_PERFORMERS.filter((performer) => ids.has(performer.id)).sort((a, b) => b.tier - a.tier);
            groupOpen = true;
            setGroupPreview({ key, members, box });
          });
      };

      // Клік — по тому ж маркеру, що й підсвічений наведенням: найближчому.
      map.on("click", (event) => {
        const { x, y } = event.point;
        const feature = nearestMarker(
          map.queryRenderedFeatures([[x - 3, y - 3], [x + 3, y + 3]], {
            layers: ["people-selected", "people", "people-clusters"],
          }),
          x,
          y
        );
        if (!feature) return;
        hideLens(true);
        if (feature.layer.id === "people-clusters") void expandCluster(feature);
        else selectPerson(feature);
      });

      if (lens && canHover) {
        map.on("mousemove", (event) => {
          if (map.isMoving()) return;
          // Кілька пікселів запасу: маленький портрет легко проскочити.
          const { x, y } = event.point;
          const feature = nearestMarker(
            map.queryRenderedFeatures([[x - 3, y - 3], [x + 3, y + 3]], {
              layers: ["people-selected", "people", "people-clusters"],
            }),
            x,
            y
          );
          if (!feature || feature.layer.id === "people-selected") {
            releaseLens();
            return;
          }
          keepLens();
          const previous = lastPointer;
          lastPointer = { x, y };
          const key = featureKey(feature);
          if (key === lensKey) {
            window.clearTimeout(switchTimer);
            pendingKey = "";
            return;
          }
          // Дорогою до списку курсор може зачепити сусідній маркер: тоді
          // перемикаємось, лише якщо він на ньому затримався. Якщо ж курсор
          // іде не до списку, сусідня група відкривається одразу.
          if (groupOpen && headingToPanel(previous, { x, y })) {
            if (pendingKey === key) return;
            window.clearTimeout(switchTimer);
            pendingKey = key;
            switchTimer = window.setTimeout(() => {
              pendingKey = "";
              showLens(feature);
            }, 160);
            return;
          }
          window.clearTimeout(switchTimer);
          pendingKey = "";
          showLens(feature);
        });
        map.on("movestart", () => hideLens(true));
        map.on("mouseout", releaseLens);
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
  }, []);

  // Теги запиту відсіюють виконавців: на карті лишаються ті, у кого є
  // схожий тег. Якщо не підійшов ніхто, показуємо всіх, а не порожню країну.
  // Підсумок кладемо в tagMatches: з нього чипи груп рахують лічильники.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      const matched = requestTags.length
        ? (await import("@/lib/tags/engine")).matchProfiles(requestTags, DEMO_PERFORMERS)
        : null;
      if (cancelled) return;
      tagMatches.set(matched?.size ? matched : null);
      matchInfoStore.set(matched ? { shown: matched.size, total: DEMO_PERFORMERS.length } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, requestTags]);

  // На карті — ті, хто під запит, з вибраних груп і міст, за потреби лише онлайн.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const visible = filterPerformers(DEMO_PERFORMERS, { matches, groups, cities, online });
    lensControlRef.current.hide(true);
    (map.getSource("people") as GeoJSONSource | undefined)?.setData(toPeople(visible));
    const ids = new Set(visible.map((performer) => performer.id));
    setSelectedId((current) => (current && ids.has(current) ? current : null));
  }, [ready, matches, groups, cities, online]);

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

  /*
   * Картка відкривається біля маркера, а не в куті: з того боку, де є
   * місце, і їде разом з ним, поки карту тягнуть. На телефоні лишається
   * шторкою знизу. useLayoutEffect: місце рахуємо до першого кадру,
   * щоб картка не блимнула в куті.
   */
  useLayoutEffect(() => {
    const map = mapRef.current;
    const card = cardRef.current;
    const performer = DEMO_PERFORMERS.find((person) => person.id === selectedId);
    if (!ready || !map || !card || !performer) return;
    const place = () => {
      if (window.innerWidth < 640) {
        card.style.removeProperty("left");
        card.style.removeProperty("top");
        card.style.removeProperty("max-height");
        return;
      }
      const point = map.project([performer.lng, performer.lat]);
      // Маркер стоїть на точці нижнім краєм; вибраний — на 30% більший.
      const markerSize = tierPx(performer) * 1.3;
      const markerCenterY = point.y - markerSize * 0.6;
      const gap = markerSize / 2 + 18;
      const { width, height } = card.getBoundingClientRect();
      const bounds = map.getContainer().getBoundingClientRect();
      // Праворуч не заходимо під панель пропозицій, якщо вона відкрита колонкою.
      const offers = document.querySelector(".offers-panel")?.getBoundingClientRect();
      const rightEdge = offers && offers.left > bounds.left + bounds.width / 2 ? offers.left - bounds.left - 16 : bounds.width - 16;
      const fitsRight = point.x + gap + width <= rightEdge;
      const left = clamp(fitsRight ? point.x + gap : point.x - gap - width, 16, rightEdge - width);
      const topEdge = topEdgeUnderStack(bounds, left, width);
      card.style.maxHeight = `${Math.max(260, bounds.height - topEdge - 16)}px`;
      const top = clamp(markerCenterY - height / 2, topEdge, Math.max(topEdge, bounds.height - Math.min(height, bounds.height - topEdge - 16) - 16));
      card.style.left = `${Math.round(left)}px`;
      card.style.top = `${Math.round(top)}px`;
      card.style.setProperty("--card-origin-x", fitsRight ? "0%" : "100%");
      card.style.setProperty("--card-origin-y", `${Math.round(clamp(markerCenterY - top, 0, height))}px`);
    };
    place();
    map.on("move", place);
    map.on("resize", place);
    // Розгорнули опис — картка виросла, і її треба знову вмістити в екран.
    const observer = new ResizeObserver(place);
    observer.observe(card);
    return () => {
      map.off("move", place);
      map.off("resize", place);
      observer.disconnect();
    };
  }, [ready, selectedId]);

  /*
   * Список групи стоїть поруч із нею: праворуч, якщо влазить, інакше
   * ліворуч; по висоті — навпроти групи, не під полем запиту. Виїжджає
   * з боку групи.
   */
  useLayoutEffect(() => {
    const panel = groupRef.current;
    const container = containerRef.current;
    if (!groupPreview || !panel || !container) return;
    const { box } = groupPreview;
    const { width, height } = panel.getBoundingClientRect();
    const bounds = container.getBoundingClientRect();
    const gap = 8;
    const fitsRight = box.left + box.width + gap + width <= bounds.width - 16;
    const left = clamp(fitsRight ? box.left + box.width + gap : box.left - gap - width, 16, bounds.width - width - 16);
    const topEdge = topEdgeUnderStack(bounds, left, width);
    const top = clamp(box.top + box.height / 2 - height / 2, topEdge, Math.max(topEdge, bounds.height - height - 16));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.transformOrigin = fitsRight ? "0% 50%" : "100% 50%";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(
      panel,
      { opacity: 0, x: fitsRight ? -8 : 8, scale: 0.97 },
      { opacity: 1, x: 0, scale: 1, duration: 0.22, ease: "power2.out" }
    );
    return () => {
      tween.kill();
    };
  }, [groupPreview]);

  useEffect(() => setPeek(null), [groupPreview]);

  // Статистика виїжджає збоку, а між рядками лише пересувається й оновлюється.
  useLayoutEffect(() => {
    const inner = peekRef.current;
    if (!peek) {
      peekShownRef.current = false;
      return;
    }
    if (!inner || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = peekShownRef.current
      ? gsap.fromTo(inner, { opacity: 0.55 }, { opacity: 1, duration: 0.16, ease: "power1.out" })
      : gsap.fromTo(
          inner,
          { opacity: 0, x: peek.side === "right" ? -6 : 6 },
          { opacity: 1, x: 0, duration: 0.2, ease: "power2.out" }
        );
    peekShownRef.current = true;
    return () => {
      tween.kill();
    };
  }, [peek]);

  /** Рядок списку під курсором: статистика навпроти нього, з того боку, де є місце. */
  const peekAt = (performer: Performer, row: HTMLElement) => {
    const panel = groupRef.current;
    const container = containerRef.current;
    if (!panel || !container) return;
    const rowBox = row.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const bounds = container.getBoundingClientRect();
    const side = bounds.right - panelBox.right >= 250 + 16 ? "right" : "left";
    setPeek({ performer, top: rowBox.top - panelBox.top + rowBox.height / 2, side });
  };

  // «На карті» з панелі пропозицій: летимо до людини й відкриваємо її картку.
  const focus = useStore(focusPerformerStore);
  useEffect(() => {
    if (!focus || !ready) return;
    const performer = DEMO_PERFORMERS.find((person) => person.id === focus.id);
    if (performer) openFromGroup(performer);
    // openFromGroup — звичайна функція компонента, запит на фокус міняється лише з `at`.
  }, [focus, ready]);

  /** З людини в списку групи — одразу до неї: наближаємо, поки група не розпадеться, і відкриваємо картку. */
  const openFromGroup = (performer: Performer) => {
    const map = mapRef.current;
    lensControlRef.current.hide(true);
    if (!map) return;
    map.easeTo({ center: [performer.lng, performer.lat], zoom: Math.max(map.getZoom(), 12), duration: 700 });
    setSelectedId(performer.id);
    setCardNotice(null);
  };

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

      {/* Збільшена копія маркера під курсором, див. showLens. Миша крізь неї йде на карту. */}
      <div ref={lensRef} aria-hidden hidden className="map-lens">
        <img alt="" draggable={false} />
      </div>

      {groupPreview && (
        <div
          ref={groupRef}
          role="dialog"
          aria-label={`У групі ${peopleCount(groupPreview.members.length)}`}
          className="group-preview glass-panel"
          onPointerEnter={() => lensControlRef.current.enterPanel()}
          onPointerLeave={() => lensControlRef.current.leavePanel()}
        >
          <p className="group-preview-title">У групі {peopleCount(groupPreview.members.length)}</p>
          <ul className="group-preview-list" onPointerLeave={() => setPeek(null)}>
            {groupPreview.members.map((performer) => {
              const size = LIST_PX[performer.tier - 1];
              const avatar = performer.avatarIndex % AVATAR_COUNT;
              return (
                <li key={performer.id}>
                  <button
                    type="button"
                    className="group-preview-row"
                    onClick={() => openFromGroup(performer)}
                    onPointerEnter={(event) => peekAt(performer, event.currentTarget)}
                    onFocus={(event) => peekAt(performer, event.currentTarget)}
                    onBlur={() => setPeek(null)}
                  >
                    <span
                      aria-hidden
                      className="group-preview-avatar"
                      style={{
                        width: size,
                        height: size,
                        backgroundImage: `url(${AVATAR_ATLAS})`,
                        backgroundPosition: `${(avatar % 4) * 100 / 3}% ${Math.floor(avatar / 4) * 100 / 3}%`,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold leading-tight text-ink">{performer.name}</span>
                      <span className="block truncate text-[11px] leading-snug text-ink-muted">{performer.specialty}</span>
                    </span>
                    <ChevronRight aria-hidden className="group-preview-chevron size-4 shrink-0" strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="group-preview-hint">Клік по групі розкриє її на карті</p>

          {peek && (
            <div className="group-peek" data-side={peek.side} style={{ top: peek.top }} aria-hidden>
              <div ref={peekRef} className="group-peek-card glass-panel">
                <p className="truncate text-[14px] font-semibold leading-tight text-ink">{peek.performer.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                  {peek.performer.specialty} · {CITIES.find((city) => city.id === peek.performer.cityId)?.name}
                </p>
                <div className="mt-2.5">
                  <ProfileStats performer={peek.performer} compact />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Плашка догрузки по центру внизу, між акаунтом і масштабом. */}
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
        <aside key={selected.id} ref={cardRef} className="performer-card glass-panel absolute inset-x-3 bottom-20 z-[var(--z-controls)] rounded-[22px] p-5 shadow-[0_18px_55px_rgba(45,60,67,.16)] max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain sm:inset-x-auto sm:bottom-auto sm:max-h-[calc(100%-120px)] sm:w-[360px]" aria-label={`Картка виконавця ${selected.name}`}>
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
          <ProfileStats performer={selected} />
          <PerformerAbout
            performer={selected}
            onOpenWork={() => setCardNotice("Сторінки робіт з'являться після підключення профілів.")}
          />
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
