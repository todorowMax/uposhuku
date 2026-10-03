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
import { AVATAR_ATLAS, AVATAR_COUNT, PORTRAIT_SIZE, createPortraitCanvas, drawPortrait } from "@/lib/map/portrait";
import { BUILDINGS_ZOOM, FONT_BOLD, UKRAINE_TRACE_RING, buildMapStyle } from "@/lib/maplibre/style";
import { DETAIL_ZOOM } from "@/lib/maplibre/static";
import { CITIES } from "@/lib/map/cities";
import { getPerformers, usePerformers } from "@/lib/map/performers";
import { RequestMapCard } from "@/components/requests/request-map-card";
import { applyRequestFilter, mapModeStore, mapRequestsStore, mapSelectedRequest, requestFilterStore } from "@/lib/feed/map-requests";
import type { MapRequest } from "@/lib/feed/types";
import { avatarBackground } from "@/lib/map/avatar-style";
import { performerStats } from "@/lib/map/stats";
import { TIER_PX } from "@/lib/placement/tiers";
import { setMapReady } from "@/lib/map/ready";
import { getRequestTags, getServerRequestTags, subscribeRequestTags } from "@/lib/map/request-tags";
import type { Performer } from "@/lib/map/types";
import { cityFilter, groupFilter, matchInfoStore, onlineFilter, tagMatches, useStore } from "@/lib/map/filters";
import { createStore } from "@/lib/store";
import { isChromium } from "@/lib/ui/glass";
import { filterPerformers } from "@/lib/map/groups";
import { focusPerformerStore } from "@/lib/requests/offers";
import { useOpenProfile } from "@/lib/profile/navigation";
import { justPublishedStore, profileEditorStore } from "@/lib/profile/client";
import { placementOpenStore } from "@/lib/placement/client";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Межі України з полями: під них підганяємо камеру на старті. */
const UKRAINE_BOUNDS: [[number, number], [number, number]] = [[22.1, 44.3], [40.3, 52.4]];
const TILT = 38;
/** Стеля щільності пікселів поза Chromium: див. де використано. */
const SAFARI_MAX_PIXEL_RATIO = 1.5;
/** Далі країни не відпускаємо: карта про Україну. */
const MIN_ZOOM = 3.3;
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

/** Три цифри профілю з роздільниками: у картці виконавця й у списку групи. */
function ProfileStats({ performer, compact = false }: { performer: Performer; compact?: boolean }) {
  const { months, orders, rating } = performerStats(performer);
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
 * Хто в групі, одним рядком: кожна людина — три символи, рівень і номер
 * обличчя («30a»; від 16 — власні фото профілів). Рядок складає сама кластеризація MapLibre
 * (clusterProperties), тож у групі видно саме тих, хто в ній є, а не
 * випадкові обличчя: розкрив групу — побачив тих самих людей.
 */
const personFace = (performer: Performer) => `${performer.tier}${performer.avatarIndex.toString(16).padStart(2, "0")}`;

/** Обличчя для картинки групи: спершу вищий рівень розміщення, без повторів. */
const clusterFaces = (faces: string) => {
  const people: { tier: number; avatar: number }[] = [];
  for (let index = 0; index + 2 < faces.length; index += 3) {
    people.push({ tier: Number(faces[index]), avatar: parseInt(faces.slice(index + 1, index + 3), 16) });
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
    drawPortrait(context, source, index, x, y, radius);
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

/** Скільки в бюджеті словами для піна: «до 15 тис ₴», «20–40 тис ₴», без суми — «Запит». */
const shortBudget = (budget: string | null) => {
  const numbers = [...(budget ?? "").matchAll(/\d[\d\s\u00a0]*/g)].map((match) => Number(match[0].replace(/\D/g, "")));
  if (numbers.length === 0) return "Запит";
  const part = (value: number) => (value >= 1000 ? `${Math.round(value / 1000)}` : String(value));
  const unit = numbers.every((value) => value >= 1000) ? " тис" : "";
  const range = numbers.slice(0, 2).map(part).join("–");
  return `${/^до/.test(budget ?? "") ? "до " : ""}${range}${unit} ₴`;
};

type PinVariant = "plain" | "match" | "own" | "sent";

const pinLabel = (item: MapRequest): { variant: PinVariant; label: string } => {
  if (item.own) return { variant: "own", label: "Ваш запит" };
  if (item.response) return { variant: "sent", label: "Ви відгукнулись" };
  if (item.matchedTags > 0) return { variant: "match", label: shortBudget(item.budget) };
  return { variant: "plain", label: shortBudget(item.budget) };
};

const PIN_STYLE: Record<PinVariant, { fill: string; text: string; badge: string; glyph: string }> = {
  plain: { fill: "#ffffff", text: "#2f3a3e", badge: "#91a99d", glyph: "#ffffff" },
  match: { fill: "#b48264", text: "#ffffff", badge: "#ffffff", glyph: "#b48264" },
  own: { fill: "#303638", text: "#ffffff", badge: "#ffffff", glyph: "#303638" },
  sent: { fill: "#e5efe8", text: "#3d6a4f", badge: "#4d7a5e", glyph: "#ffffff" },
};

const PIN_RATIO = 3;

/**
 * Пін запиту: «бульбашка» з іконкою документа й сумою. Не схожий на фото
 * виконавця, тож на карті видно різницю з першого погляду; золотий — запит
 * під ваші теги, темний — ваш власний, зелений — ви вже відгукнулись.
 */
const createRequestPin = (variant: PinVariant, label: string) => {
  const style = PIN_STYLE[variant];
  const font = "600 12px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("Canvas 2D is unavailable");
  probe.font = font;
  const textWidth = Math.ceil(probe.measureText(label).width);
  const pad = 6;
  const body = { w: 8 + 18 + 6 + textWidth + 12, h: 28 };
  const tip = 7;
  const width = body.w + pad * 2;
  const height = body.h + tip + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * PIN_RATIO;
  canvas.height = height * PIN_RATIO;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.scale(PIN_RATIO, PIN_RATIO);

  const x = pad;
  const y = pad;
  const radius = body.h / 2;
  // Тіло з хвостиком одним контуром: тінь лягає цілою фігурою.
  context.save();
  context.shadowColor = "rgba(48, 68, 64, .3)";
  context.shadowBlur = 7;
  context.shadowOffsetY = 3;
  context.fillStyle = style.fill;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + body.w - radius, y);
  context.arc(x + body.w - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
  context.lineTo(x + body.w / 2 + 6, y + body.h);
  context.lineTo(x + body.w / 2, y + body.h + tip);
  context.lineTo(x + body.w / 2 - 6, y + body.h);
  context.lineTo(x + radius, y + body.h);
  context.arc(x + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2);
  context.closePath();
  context.fill();
  context.restore();
  if (variant === "plain" || variant === "sent") {
    context.strokeStyle = "rgba(145, 169, 157, .55)";
    context.lineWidth = 1;
    context.stroke();
  }

  // Значок-документ у кружечку.
  const bx = x + 5 + 9;
  const by = y + body.h / 2;
  context.fillStyle = style.badge;
  context.beginPath();
  context.arc(bx, by, 9, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = style.glyph;
  context.lineWidth = 1.5;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(bx - 3.5, by - 2.5);
  context.lineTo(bx + 3.5, by - 2.5);
  context.moveTo(bx - 3.5, by + 0.2);
  context.lineTo(bx + 3.5, by + 0.2);
  context.moveTo(bx - 3.5, by + 2.9);
  context.lineTo(bx + 1, by + 2.9);
  context.stroke();

  context.fillStyle = style.text;
  context.font = font;
  context.textBaseline = "middle";
  context.fillText(label, x + 8 + 18 + 6, y + body.h / 2 + 0.5);
  return canvas;
};

const requestFeatures = (items: MapRequest[]): FeatureCollection<Point> => ({
  type: "FeatureCollection",
  features: items
    .filter((item) => item.point)
    .map((item) => {
      const { variant, label } = pinLabel(item);
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [item.point!.lng, item.point!.lat] },
        properties: { rid: item.id, icon: `req|${variant}|${label}`, prio: variant === "match" ? 3 : variant === "own" ? 4 : variant === "plain" ? 1 : 2 },
      };
    }),
});

const toPeople = (performers: Performer[]): FeatureCollection<Point> => ({
  type: "FeatureCollection",
  features: performers.map((performer) => ({
    type: "Feature",
    id: performer.id,
    geometry: { type: "Point", coordinates: [performer.lng, performer.lat] },
    properties: {
      id: performer.id,
      avatar: `avatar-${performer.avatarIndex}`,
      size: tierPx(performer) / PORTRAIT_LOGICAL,
      rank: performer.tier,
      face: personFace(performer),
    },
  })),
});
const initialPeople = () => toPeople(getPerformers());

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

/**
 * Положення повзунка масштабу лежить у сховищі, а не в стані сцени: під час
 * зуму воно змінюється щокадру, і перемальовувати через нього всю сцену
 * (1400 рядків) було б марною роботою, особливо в Safari.
 */
const zoomSliderStore = createStore(0);

function ConnectedZoomControl({ mapRef, farZoomRef }: { mapRef: React.RefObject<MapLibreMap | null>; farZoomRef: React.RefObject<number> }) {
  const value = useStore(zoomSliderStore);
  return (
    <MapZoomControl
      value={value}
      onChange={(next) => mapRef.current?.jumpTo({ zoom: sliderToZoom(next, farZoomRef.current) })}
      onStep={(direction) => mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 0) + direction * 1.2, duration: 320 })}
    />
  );
}

export default function MapLibreScene() {
  const openProfile = useOpenProfile();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const avatarAtlasRef = useRef<HTMLImageElement | null>(null);
  const farZoomRef = useRef(5);
  const minZoomRef = useRef(MIN_ZOOM);
  /** Стартовий кадр: від нього рахуються межі руху. До завантаження — центр України. */
  const homeRef = useRef({ lng: 31.2, lat: 48.4, zoom: 5 });
  const cardRef = useRef<HTMLElement>(null);
  /** Масштаб, до якого зараз летить камера: потрібен для меж панорами, див. transformConstrain. */
  const flightZoomRef = useRef<number | null>(null);
  const reqActiveRef = useRef<(() => void) | null>(null);
  const flyToRef = useRef<((map: MapLibreMap, center: [number, number], zoom: number, duration: number) => void) | null>(null);
  const [ready, setReady] = useState(false);
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
  const performers = usePerformers();
  const mode = useStore(mapModeStore);
  const requestFilter = useStore(requestFilterStore);
  const requestState = useStore(mapRequestsStore);
  const selectedRequestId = useStore(mapSelectedRequest);
  const selectedRequest = mode === "requests" ? requestState.items.find((item) => item.id === selectedRequestId && item.point) : undefined;
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
      // На телефоні поле запиту вужче й нижче, а боків майже немає: країна має влізти ціла.
      fitBoundsOptions: { padding: window.innerWidth < 640 ? { top: 135, bottom: 75, left: 6, right: 6 } : { top: 190, bottom: 60, left: 40, right: 40 } },
      pitch: TILT,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxPitch: 65,
      attributionControl: { compact: true },
      // У проєкції глобуса maxBounds не діє, тож межі задаємо самі.
      transformConstrain: (lngLat, zoom) => {
        const home = homeRef.current;
        // Літаємо далеко з віддаленого масштабу: межі рахуємо за масштабом, куди летимо,
        // інакше центр залипає на краю дозволеного для старого масштабу.
        const t = clamp((Math.max(zoom, flightZoomRef.current ?? zoom) - home.zoom) / 2, 0, 1);
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
    // Safari на ретині малює глобус у повному 2–3× і гальмує на зумі та перетягуванні.
    // Знижуємо щільність до 1.5: пікселів майже вдвічі менше, на око різниця невелика.
    if (!isChromium() && window.devicePixelRatio > SAFARI_MAX_PIXEL_RATIO) map.setPixelRatio(SAFARI_MAX_PIXEL_RATIO);
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
    /**
     * Поки людина рухає карту, стежку не перемальовуємо: кожен кадр анімації
     * це setPaintProperty з новим градієнтом і setData, а разом із зумом чи
     * перетягуванням це зайве навантаження (Safari відчуває його першим).
     * Після зупинки вона продовжує, а далеко від країни й так не видна.
     */
    let traceBusy = false;
    let traceWanted = false;
    const stopTrace = () => {
      cancelAnimationFrame(traceFrame);
      traceFrame = 0;
    };
    const startTrace = () => {
      if (!traceWanted || traceBusy || traceFrame || document.hidden) return;
      traceFrame = requestAnimationFrame(animateTrace);
    };

    function animateTrace(timestamp: number) {
      if (traceBusy || document.hidden) {
        traceFrame = 0;
        return;
      }
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
    }

    map.on("movestart", () => {
      traceBusy = true;
      stopTrace();
    });
    map.on("moveend", () => {
      traceBusy = false;
      startTrace();
    });
    const onVisibility = () => (document.hidden ? stopTrace() : startTrace());
    document.addEventListener("visibilitychange", onVisibility);

    map.on("load", async () => {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        traceWanted = true;
        startTrace();
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
      // Картинка групи залежить від складу, а власні фото профілів з'являються
      // вже після старту, тож малюємо їх, коли MapLibre попросить.
      map.setMissingStyleImageResolver((id) => {
        const portrait = /^avatar-(\d+)$/.exec(id);
        if (portrait && !map.hasImage(id)) {
          const canvas = createPortraitCanvas(source, Number(portrait[1]));
          const context = canvas.getContext("2d");
          if (context) map.addImage(id, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: PORTRAIT_RATIO });
          return;
        }
        if (id.startsWith("req|")) {
          const [, variant, ...rest] = id.split("|");
          if (map.hasImage(id) || !(variant in PIN_STYLE)) return;
          const canvas = createRequestPin(variant as PinVariant, rest.join("|"));
          const context = canvas.getContext("2d");
          if (context) map.addImage(id, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: PIN_RATIO });
          return;
        }
        const match = /^cluster-((?:[1-6][0-9a-f]{2})+)$/.exec(id);
        if (!match || map.hasImage(id)) return;
        const canvas = createClusterImage(source, match[1]);
        const context = canvas.getContext("2d");
        if (context) map.addImage(id, context.getImageData(0, 0, CLUSTER_W, CLUSTER_H), { pixelRatio: CLUSTER_RATIO });
      });

      // Групи — вбудована кластеризація: самі розкриваються при наближенні.
      map.addSource("people", {
        type: "geojson",
        data: initialPeople(),
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

      // Запити замовників: свої кластери й піни, видимі лише в режимі «Запити».
      map.addSource("requests-map", {
        type: "geojson",
        data: requestFeatures([]),
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 10,
      });
      const hidden = { visibility: "none" } as const;
      map.addLayer({
        id: "req-clusters",
        type: "circle",
        source: "requests-map",
        filter: ["has", "point_count"],
        layout: hidden,
        paint: {
          "circle-color": "#7e9d90",
          "circle-radius": ["step", ["get", "point_count"], 15, 5, 19, 15, 24],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-pitch-alignment": "viewport",
        },
      });
      map.addLayer({
        id: "req-cluster-count",
        type: "symbol",
        source: "requests-map",
        filter: ["has", "point_count"],
        layout: { ...hidden, "text-field": ["get", "point_count_abbreviated"], "text-font": FONT_BOLD, "text-size": 13, "text-allow-overlap": true },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "req-pins",
        type: "symbol",
        source: "requests-map",
        filter: ["!", ["has", "point_count"]],
        layout: { ...hidden, "icon-image": ["get", "icon"], "icon-anchor": "bottom", "icon-allow-overlap": true, "symbol-sort-key": ["get", "prio"] },
      });
      map.addLayer({
        id: "req-active",
        type: "symbol",
        source: "requests-map",
        filter: ["==", ["get", "rid"], "__none__"],
        layout: { ...hidden, "icon-image": ["get", "icon"], "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-size": 1.16 },
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

      /** Політ камери до точки з урахуванням меж панорами. */
      const flyTo = (target: MapLibreMap, center: [number, number], zoom: number, duration: number) => {
        flightZoomRef.current = zoom;
        target.once("moveend", () => {
          flightZoomRef.current = null;
        });
        target.easeTo({ center, zoom, duration });
      };
      flyToRef.current = flyTo;

      const expandCluster = async (feature: MapGeoJSONFeature) => {
        setSelectedId(null);
        const clusterId = feature.properties?.cluster_id as number;
        const zoom = await (map.getSource("people") as GeoJSONSource).getClusterExpansionZoom(clusterId);
        flyTo(map, (feature.geometry as Point).coordinates as [number, number], zoom + 0.3, 620);
      };
      const selectPerson = (feature: MapGeoJSONFeature | undefined) => {
        setSelectedId((feature?.properties?.id as string) ?? null);
        setCardNotice(null);
      };
      for (const layer of ["people", "people-selected", "people-clusters", "req-pins", "req-clusters"]) {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }

      // Запити: наведення збільшує пін, клік відкриває картку, кластер розкривається.
      let hoveredRequest: string | null = null;
      const updateActive = () => {
        const ids = [hoveredRequest, mapSelectedRequest.get()].filter((id): id is string => Boolean(id));
        map.setFilter("req-active", ["in", ["get", "rid"], ["literal", ids.length ? ids : ["__none__"]]]);
      };
      reqActiveRef.current = updateActive;
      map.on("mousemove", "req-pins", (event) => {
        const rid = event.features?.[0]?.properties?.rid as string | undefined;
        if (rid && rid !== hoveredRequest) {
          hoveredRequest = rid;
          updateActive();
        }
      });
      map.on("mouseleave", "req-pins", () => {
        hoveredRequest = null;
        updateActive();
      });
      map.on("click", "req-pins", (event) => {
        const rid = event.features?.[0]?.properties?.rid as string | undefined;
        if (!rid) return;
        setSelectedId(null);
        mapSelectedRequest.set(rid);
      });
      map.on("click", "req-clusters", async (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        mapSelectedRequest.set(null);
        const zoom = await (map.getSource("requests-map") as GeoJSONSource).getClusterExpansionZoom(feature.properties?.cluster_id as number);
        flyTo(map, (feature.geometry as Point).coordinates as [number, number], zoom + 0.3, 620);
      });
      // Клік повз запити знімає вибір.
      map.on("click", (event) => {
        if (!mapSelectedRequest.get()) return;
        const { x, y } = event.point;
        if (map.queryRenderedFeatures([[x - 4, y - 4], [x + 4, y + 4]], { layers: ["req-pins", "req-clusters"] }).length === 0) mapSelectedRequest.set(null);
      });

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
            const members = getPerformers().filter((performer) => ids.has(performer.id)).sort((a, b) => b.tier - a.tier);
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

    const syncSlider = () => zoomSliderStore.set(zoomToSlider(map.getZoom(), farZoomRef.current));
    map.on("zoom", syncSlider);

    // Плашка «Підвантажуємо деталі» лише там, де справді йдемо в мережу:
    // з DETAIL_ZOOM і поки тайли OSM не доїхали.
    map.on("dataloading", () => {
      if (map.getZoom() >= DETAIL_ZOOM && !map.areTilesLoaded()) setDetailLoading(true);
    });
    map.on("idle", () => setDetailLoading(false));

    return () => {
      cancelAnimationFrame(traceFrame);
      document.removeEventListener("visibilitychange", onVisibility);
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
        ? (await import("@/lib/tags/engine")).matchProfiles(requestTags, performers)
        : null;
      if (cancelled) return;
      tagMatches.set(matched?.size ? matched : null);
      matchInfoStore.set(matched ? { shown: matched.size, total: performers.length } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, requestTags, performers]);

  // Режим карти: або виконавці, або запити. Другого не показуємо взагалі, щоб не плутати.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const requestLayers = ["req-clusters", "req-cluster-count", "req-pins", "req-active"];
    const peopleLayers = ["people", "people-clusters", "people-selected"];
    for (const id of requestLayers) map.setLayoutProperty(id, "visibility", mode === "requests" ? "visible" : "none");
    for (const id of peopleLayers) map.setLayoutProperty(id, "visibility", mode === "requests" ? "none" : "visible");
    lensControlRef.current.hide(true);
    if (mode === "requests") setSelectedId(null);
  }, [ready, mode]);

  // Запити на карті: усі або відфільтровані, без віддалених (їм нема де стати).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("requests-map") as GeoJSONSource | undefined)?.setData(requestFeatures(applyRequestFilter(requestState.items, requestFilter)));
    reqActiveRef.current?.();
  }, [ready, requestState.items, requestFilter]);

  useEffect(() => reqActiveRef.current?.(), [ready, selectedRequestId]);

  // На карті — ті, хто під запит, з вибраних груп і міст, за потреби лише онлайн.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const visible = filterPerformers(performers, { matches, groups, cities, online });
    lensControlRef.current.hide(true);
    (map.getSource("people") as GeoJSONSource | undefined)?.setData(toPeople(visible));
    const ids = new Set(visible.map((performer) => performer.id));
    setSelectedId((current) => (current && ids.has(current) ? current : null));
  }, [ready, performers, matches, groups, cities, online]);

  useEffect(() => {
    const map = mapRef.current;
    const atlas = avatarAtlasRef.current;
    if (!ready || !map?.getLayer("people-selected") || !atlas) return;
    let frame = 0;
    if (selectedId) {
      const performer = getPerformers().find((person) => person.id === selectedId);
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
    const performer = getPerformers().find((person) => person.id === selectedId);
    const request = mapRequestsStore.get().items.find((item) => item.id === mapSelectedRequest.get() && item.point);
    // Маркер, біля якого стоїть картка: фото виконавця або пін запиту.
    const anchor = performer
      ? { lng: performer.lng, lat: performer.lat, centerDy: tierPx(performer) * 1.3 * 0.6, half: (tierPx(performer) * 1.3) / 2 }
      : request?.point
        ? { lng: request.point.lng, lat: request.point.lat, centerDy: 18, half: 56 }
        : null;
    if (!ready || !map || !card || !anchor) return;
    const place = () => {
      if (window.innerWidth < 640) {
        card.style.removeProperty("left");
        card.style.removeProperty("top");
        card.style.removeProperty("max-height");
        return;
      }
      const point = map.project([anchor.lng, anchor.lat]);
      // Маркер стоїть на точці нижнім краєм.
      const markerCenterY = point.y - anchor.centerDy;
      const gap = anchor.half + 18;
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
  }, [ready, selectedId, selectedRequestId]);

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

  // Щойно опублікували профіль: летимо до себе й показуємо, як нас бачать.
  const justPublished = useStore(justPublishedStore);
  useEffect(() => {
    if (!justPublished || !ready) return;
    const me = getPerformers().find((person) => person.id === justPublished.id);
    if (me) openFromGroup(me);
    // openFromGroup — звичайна функція компонента; спрацьовуємо лише на нову публікацію.
  }, [justPublished, ready]);

  // «На карті» з панелі пропозицій: летимо до людини й відкриваємо її картку.
  const focus = useStore(focusPerformerStore);
  useEffect(() => {
    if (!focus || !ready) return;
    const performer = getPerformers().find((person) => person.id === focus.id);
    if (performer) openFromGroup(performer);
    // openFromGroup — звичайна функція компонента, запит на фокус міняється лише з `at`.
  }, [focus, ready]);

  /** З людини в списку групи — одразу до неї: наближаємо, поки група не розпадеться, і відкриваємо картку. */
  const openFromGroup = (performer: Performer) => {
    const map = mapRef.current;
    lensControlRef.current.hide(true);
    if (!map) return;
    if (flyToRef.current) flyToRef.current(map, [performer.lng, performer.lat], Math.max(map.getZoom(), 12), 700);
    setSelectedId(performer.id);
    setCardNotice(null);
  };

  useEffect(() => {
    if (!selectedId && !selectedRequestId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedId(null);
      mapSelectedRequest.set(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, selectedRequestId]);

  const selected = performers.find((performer) => performer.id === selectedId);
  const selectedCity = CITIES.find((city) => city.id === selected?.cityId);

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <div aria-hidden className="space-bg" data-ready={ready || undefined} />
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
                      style={avatarBackground(performer, size)}
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

      {/* Плашка догрузки по центру внизу, над перемикачем режиму карти. */}
      <div
        aria-live="polite"
        className={`pointer-events-none absolute bottom-[132px] left-1/2 z-[var(--z-controls)] -translate-x-1/2 transition-[opacity,translate] duration-300 sm:bottom-[84px] ${
          detailLoading ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <div className="glass-panel flex items-center gap-2.5 rounded-full px-4 py-2 text-[13px] font-medium text-ink-muted">
          <span aria-hidden className="map-detail-spinner" />
          {detailLoading ? "Підвантажуємо деталі…" : ""}
        </div>
      </div>

      {selectedRequest && <RequestMapCard ref={cardRef} item={selectedRequest} />}

      {selected && (
        <aside key={selected.id} ref={cardRef} className="performer-card glass-panel absolute inset-x-3 bottom-20 z-[var(--z-controls)] rounded-[22px] p-5 shadow-[0_18px_55px_rgba(45,60,67,.16)] max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain sm:inset-x-auto sm:bottom-auto sm:max-h-[calc(100%-120px)] sm:w-[360px]" aria-label={`Картка виконавця ${selected.name}`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="size-16 shrink-0 rounded-2xl bg-[#e6e9e7] bg-no-repeat shadow-[inset_0_0_0_1px_rgba(255,255,255,.6)]" style={avatarBackground(selected)} role="img" aria-label={`Фото ${selected.name}`} />
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
          {selected.mine ? (
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={() => placementOpenStore.set(true)} className="min-h-10 w-full rounded-2xl bg-[#303638] px-4 text-[12px] font-medium text-white transition-colors hover:bg-[#4c5558]">{selected.tier >= 6 ? "Ваше розміщення" : "Підняти на карті"}</button>
              <button type="button" onClick={() => profileEditorStore.set(true)} className="min-h-10 w-full rounded-2xl border border-[#b8c4c7] bg-white/75 px-4 text-[12px] font-medium text-ink shadow-[0_1px_2px_rgba(42,53,57,.05)] transition-colors hover:border-[#87999e] hover:bg-white">Редагувати профіль</button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={() => openProfile(selected.id)} className="min-h-10 w-full rounded-2xl border border-[#b8c4c7] bg-white/75 px-4 text-[12px] font-medium text-ink shadow-[0_1px_2px_rgba(42,53,57,.05)] transition-colors hover:border-[#87999e] hover:bg-white">Переглянути профіль</button>
              <button type="button" onClick={() => { document.getElementById("request")?.focus(); setCardNotice("Опишіть роботу в полі запиту."); }} className="min-h-10 w-full rounded-2xl bg-[#303638] px-4 text-[12px] font-medium text-white transition-colors hover:bg-[#4c5558]">Запропонувати роботу</button>
            </div>
          )}
          <p aria-live="polite" className="mt-3 min-h-4 text-[10px] text-ink-muted/75">{cardNotice ?? (selected.mine ? "Так вас бачать замовники" : "Демонстраційні дані профілю")}</p>
        </aside>
      )}

      <ConnectedZoomControl mapRef={mapRef} farZoomRef={farZoomRef} />
    </div>
  );
}
