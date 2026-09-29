"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import {
  AmbientLight,
  ClampToEdgeWrapping,
  DirectionalLight,
  Object3D,
  Raycaster,
  SRGBColorSpace,
  Sprite,
  TextureLoader,
  Vector2,
  type PerspectiveCamera,
  type Texture,
} from "three";
import { GlobeZoomControl } from "@/components/globe/zoom-control";
import {
  cameraPose,
  fitDistance,
  GLOBE_RADIUS,
  localFrame,
  panView,
  plateauAltitude,
  zoomToDistance,
  type MapView,
} from "@/lib/globe/camera";
import ukraine from "@/lib/globe/data/ukraine.geo.json";
import { avatarPosition, createMarkerElement, type HtmlMarker } from "@/lib/globe/html";
import {
  createMarkerSprite,
  disposeMarkerAssets,
  loadMarkerAssets,
  markerTexture,
  placeMarkerSprite,
  type MarkerAssets,
  type VisualMarker,
} from "@/lib/globe/visual-markers";
import {
  createCapMaterial,
  createSideMaterial,
  createSurfaceMaterial,
} from "@/lib/globe/materials";
import { GLOBE_PALETTE } from "@/lib/globe/palette";
import { CITIES } from "@/lib/map/cities";
import { DEMO_PERFORMERS, DEMO_REQUESTS } from "@/lib/map/demo";
import { setMapReady } from "@/lib/map/ready";
import { distanceKm } from "@/lib/map/scatter";
import type { Performer } from "@/lib/map/types";

/** Вертикальний кут огляду камери globe.gl, градуси. */
const VERTICAL_FOV = 50;
/**
 * Нахил камери. У макеті близько 55°, і північ відлітає вдалину. 38°
 * підносить верх країни ближче: Чернігів і Суми читаються так само, як
 * Одеса, а горизонт ще видно.
 */
const TILT_DEG = 38;
/** Найбільша висота плато України, частки радіуса (0,004 ≈ 25 км). */
const PLATEAU_ALTITUDE = 0.004;
/** Відстань камери, на якій плато має повну висоту: вся країна в кадрі. */
const PLATEAU_FULL_DISTANCE = 17;
/** Ширина, яку кадр вміщає на рівні «Україна», км: країна плюс поля. */
const UKRAINE_FRAME_KM = 1750;
/**
 * На вузькому екрані вся ширина країни робить її дрібною плямою. Там
 * кадр тісніший: краї країни трохи за рамкою, і їх видно, якщо потягнути.
 */
const UKRAINE_FRAME_KM_NARROW = 1150;
/** Найближча відстань камери, одиниці сцени (≈ 250 км до фокуса). */
const CITY_DISTANCE = 4;
/**
 * Зсув кадру вниз, частка висоти. Україна стоїть помітно нижче центру:
 * над нею лишається небо й вигин горизонту, там поле запиту.
 */
const FRAME_SHIFT = 0.18;
/** Центр країни, куди дивиться камера на старті. */
const START = { lat: 48.1, lng: 31.4 };
/**
 * Наскільки далеко від підпису міста курсор на фото ще гасить підпис, px:
 * приблизно радіус найбільшої аватарки.
 */
const LABEL_HOVER_REACH_PX = 26;
/** Від скількох людей у місті вони збираються в ромб-групу. */
const GROUP_MIN = 4;
/** Міста, де людей досить для групи. */
const GROUP_CITIES = CITIES.filter(
  (city) => DEMO_PERFORMERS.filter((performer) => performer.cityId === city.id).length >= GROUP_MIN
);
/*
 * Автовідкриття групи, коли людина сама наближається до міста колесом,
 * щипком чи повзунком. Пороги з запасом (гістерезис): відкривається
 * ближче, ніж закривається, тож на межі група не блимає.
 */
const AUTO_OPEN_ZOOM = 0.55;
const AUTO_CLOSE_ZOOM = 0.4;
const AUTO_OPEN_KM = 170;
const AUTO_CLOSE_KM = 260;

interface Size {
  width: number;
  height: number;
}

const loadTexture = async (url: string): Promise<Texture> => {
  const texture = await new TextureLoader().loadAsync(url);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/*
 * Аксесори шарів поза компонентом. globe.gl порівнює пропси за
 * посиланням: нова стрілочна функція на кожен рендер означала б
 * перебудову полігона й DOM-підписів на кожен крок масштабу.
 */
const RENDERER_CONFIG = { antialias: true, alpha: true, powerPreference: "high-performance" } as const;
const polygonStrokeColor = () => GLOBE_PALETTE.ukraineStroke;

export default function GlobeScene() {
  const stageRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState<Size | null>(null);
  const [textures, setTextures] = useState<{ world: Texture; region: Texture } | null>(null);
  const [markerAssets, setMarkerAssets] = useState<MarkerAssets | null>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [expandedCityId, setExpandedCityId] = useState<string | null>(null);
  const [selectedPerformerId, setSelectedPerformerId] = useState<string | null>(null);
  const plateauRef = useRef<Object3D | null>(null);
  const markerSpritesRef = useRef<Set<Sprite>>(new Set());
  const zoomRef = useRef(0);
  const viewRef = useRef<MapView>({ ...START, distance: 20, tilt: TILT_DEG });
  const animationRef = useRef<number | null>(null);
  /** Поточна відкрита група для жестів, без чекання на рендер. */
  const expandedRef = useRef<string | null>(null);
  /** Автовідкриття вимкнене, поки камера сама під'їжджає до групи. */
  const autoGroupRef = useRef(true);
  /** Точка курсора, поки він над людиною чи групою; інакше null. */
  const hoverPointRef = useRef<{ x: number; y: number } | null>(null);

  /*
   * Підписи міст — DOM поверх WebGL, тож фото не можна підняти над ними
   * через z-index. Натомість підпис поступається: коли курсор на фото чи
   * ромбі поруч із підписом, той майже зникає, хай би з якого міста була
   * людина. У розкритій групі підпис її міста ховається зовсім: назва й
   * так у картці.
   */
  const syncCityLabels = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const point = hoverPointRef.current;
    stage.querySelectorAll<HTMLElement>(".globe-anchor[data-city]").forEach((anchor) => {
      let state = "shown";
      if (anchor.dataset.city === expandedRef.current) state = "hidden";
      else if (point) {
        const label = anchor.firstElementChild?.getBoundingClientRect();
        const reach = LABEL_HOVER_REACH_PX;
        if (
          label &&
          point.x > label.left - reach &&
          point.x < label.right + reach &&
          point.y > label.top - reach &&
          point.y < label.bottom + reach
        ) {
          state = "faded";
        }
      }
      if (anchor.dataset.label !== state) anchor.dataset.label = state;
    });
  }, []);

  useEffect(() => {
    expandedRef.current = expandedCityId;
    syncCityLabels();
  }, [expandedCityId, syncCityLabels]);

  /** Відкриває групу міста в центрі кадру на близькому масштабі й згортає на далекому. */
  const syncAutoGroup = useCallback(() => {
    if (!autoGroupRef.current) return;
    const view = viewRef.current;
    const zoomLevel = zoomRef.current;
    const current = expandedRef.current;
    let next = current;
    if (current) {
      const city = GROUP_CITIES.find((item) => item.id === current);
      if (zoomLevel < AUTO_CLOSE_ZOOM || !city || distanceKm(view, city) > AUTO_CLOSE_KM) next = null;
    }
    if (!next && zoomLevel >= AUTO_OPEN_ZOOM) {
      let best = AUTO_OPEN_KM;
      for (const city of GROUP_CITIES) {
        const distance = distanceKm(view, city);
        if (distance <= best) {
          best = distance;
          next = city.id;
        }
      }
    }
    if (next === current) return;
    expandedRef.current = next;
    setExpandedCityId(next);
    setSelectedPerformerId(null);
  }, []);

  // Розмір сцени беремо з контейнера, а не з вікна: над картою згодом
  // з'являться інші блоки.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loaded: MarkerAssets | null = null;
    loadMarkerAssets().then((assets) => {
      if (cancelled) disposeMarkerAssets(assets);
      else {
        loaded = assets;
        setMarkerAssets(assets);
      }
    }).catch((error) => console.error("Не вдалося завантажити портрети карти", error));
    return () => {
      cancelled = true;
      if (loaded) disposeMarkerAssets(loaded);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadTexture("/globe/earth.webp"), loadTexture("/globe/region.webp")]).then(
      ([world, region]) => {
        if (!cancelled) setTextures({ world, region });
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const materials = useMemo(() => {
    if (!textures) return null;
    return {
      surface: createSurfaceMaterial(textures.world, textures.region),
      cap: createCapMaterial(textures.region),
      side: createSideMaterial(),
    };
  }, [textures]);

  /** Межі наближення залежать від пропорцій екрана. */
  const distances = useMemo(() => {
    if (!size) return null;
    const aspect = size.width / size.height;
    const frameKm = aspect < 1 ? UKRAINE_FRAME_KM_NARROW : UKRAINE_FRAME_KM;
    const far = fitDistance(frameKm, aspect, VERTICAL_FOV);
    return { far, near: Math.min(CITY_DISTANCE, far * 0.5) };
  }, [size]);

  /** Ставить камеру за поточним видом. Викликається на кожен рух. */
  const applyView = useCallback(() => {
    const globe = globeRef.current;
    if (!globe || !size) return;
    const view = viewRef.current;
    const camera = globe.camera() as PerspectiveCamera;
    const altitude = plateauAltitude(view.distance, PLATEAU_ALTITUDE, PLATEAU_FULL_DISTANCE);
    const pose = cameraPose(view, altitude);
    camera.position.copy(pose.position);
    camera.up.copy(pose.up);
    camera.lookAt(pose.target);
    // Зсув об'єктива, а не повороту камери: перспектива та сама, просто
    // Україна опускається в кадрі.
    camera.setViewOffset(size.width, size.height, 0, -FRAME_SHIFT * size.height, size.width, size.height);

    // Плато будується один раз на повну висоту, а нижчим стає масштабом
    // від центру Землі: напрямки не змінюються, тож широта й довгота
    // кожної точки ті самі, змінюється лише висота. Нижня кромка стінок
    // іде під поверхню, де її ховає сама Земля.
    if (!plateauRef.current) {
      // Обхід іде від батька до дітей: перший знайдений і є весь полігон
      // разом із верхом, стінками й контуром.
      globe.scene().traverse((object) => {
        const type = (object as Object3D & { __globeObjType?: string }).__globeObjType;
        if (type === "polygon" && !plateauRef.current) plateauRef.current = object;
      });
    }
    plateauRef.current?.scale.setScalar((1 + altitude) / (1 + PLATEAU_ALTITUDE));

    // WebGL-спрайти та поверхня рухаються в одному кадрі. Ніякої
    // React-зміни координат HTML-портретів після руху камери немає.
    for (const sprite of markerSpritesRef.current) {
      if (!sprite.parent) {
        sprite.material.dispose();
        markerSpritesRef.current.delete(sprite);
        continue;
      }
      placeMarkerSprite(sprite, camera, size.height, altitude, size.width < 640);
    }
    // Пасивні підписи також тримаємо на висоті поверхні синхронно,
    // без перебудови DOM-шару на кожному кроці масштабу.
    globe.scene().traverse((object) => {
      const type = (object as Object3D & { __globeObjType?: string }).__globeObjType;
      if (type === "html") object.position.setLength(GLOBE_RADIUS * (1 + altitude));
    });

    // globe.gl перераховує видимість підписів на цю подію: без неї
    // HTML-шар не знає, що камера зрушила.
    globe.controls().dispatchEvent({ type: "change" });
  }, [size]);

  const setZoomLevel = useCallback(
    (next: number) => {
      if (!distances) return;
      const clamped = Math.min(1, Math.max(0, next));
      zoomRef.current = clamped;
      setZoom(clamped);
      const distance = zoomToDistance(clamped, distances.far, distances.near);
      viewRef.current = { ...viewRef.current, distance };
      applyView();
      syncAutoGroup();
    },
    [applyView, distances, syncAutoGroup]
  );

  const stopAnimation = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    autoGroupRef.current = true;
  };

  /** Плавне наближення для кнопок: ease-out, без пружин. */
  const animateZoomTo = useCallback(
    (target: number) => {
      stopAnimation();
      const from = zoomRef.current;
      const to = Math.min(1, Math.max(0, target));
      if (prefersReducedMotion()) return setZoomLevel(to);
      const started = performance.now();
      const duration = 320;
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setZoomLevel(from + (to - from) * eased);
        animationRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [setZoomLevel]
  );

  /** Група під'їжджає до центру кадру; при закритті повертаємо всю країну. */
  const animateFocusTo = useCallback(
    (cityId: string | null) => {
      if (!distances) return;
      stopAnimation();
      const city = cityId ? CITIES.find((item) => item.id === cityId) : null;
      const start = { ...viewRef.current };
      const startZoom = zoomRef.current;
      const targetZoom = city ? Math.max(startZoom, 0.78) : 0;
      const target = city ?? START;
      setExpandedCityId(city?.id ?? null);
      expandedRef.current = city?.id ?? null;
      setSelectedPerformerId(null);
      autoGroupRef.current = false;

      const move = (progress: number) => {
        viewRef.current = {
          ...viewRef.current,
          lat: start.lat + (target.lat - start.lat) * progress,
          lng: start.lng + (target.lng - start.lng) * progress,
        };
        setZoomLevel(startZoom + (targetZoom - startZoom) * progress);
      };
      if (prefersReducedMotion()) {
        move(1);
        autoGroupRef.current = true;
        return;
      }
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / 620);
        move(1 - Math.pow(1 - t, 3));
        animationRef.current = t < 1 ? requestAnimationFrame(step) : null;
        if (t >= 1) autoGroupRef.current = true;
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [distances, setZoomLevel]
  );

  const pickMarker = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      const globe = globeRef.current;
      if (!stage || !globe) return null;
      const rect = stage.getBoundingClientRect();
      const pointer = new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new Raycaster();
      raycaster.setFromCamera(pointer, globe.camera() as PerspectiveCamera);
      const sprites = [...markerSpritesRef.current].filter((sprite) => sprite.parent);
      const hit = raycaster.intersectObjects(sprites, false)[0];
      return (hit?.object.userData.marker as VisualMarker | undefined) ?? null;
    },
    []
  );

  const onGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    // Штатне обертання навколо центру Землі вимикаємо: камерою керує
    // applyView, а жести обробляємо самі.
    globe.controls().enabled = false;

    const renderer = globe.renderer();
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (textures) {
      // Під нахилом текстура стискається по вертикалі; без анізотропної
      // фільтрації північ країни розмивається в кашу.
      for (const texture of [textures.world, textures.region]) {
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
      }
    }

    // Світло з північного заходу й згори для поверхні планети.
    const { up, north, east } = localFrame(START.lat, START.lng);
    const sun = new DirectionalLight(0xffffff, Math.PI * 0.6);
    sun.position
      .copy(up)
      .multiplyScalar(0.75)
      .addScaledVector(east, -0.7)
      .addScaledVector(north, 0.35)
      .normalize()
      .multiplyScalar(1000);
    globe.lights([new AmbientLight(0xffffff, Math.PI * 0.72), sun]);

    setGlobeReady(true);
  }, [textures]);

  // Перший кадр і кожна зміна розміру: камера на місці, рівень
  // наближення зберігається.
  useEffect(() => {
    if (!globeReady || !distances) return;
    setZoomLevel(zoomRef.current);
  }, [globeReady, distances, setZoomLevel]);

  // Жести: тягнути мишею чи пальцем, колесо, щипок двома пальцями.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !size || !distances) return;
    const pointers = new Map<number, { x: number; y: number }>();
    const starts = new Map<number, { x: number; y: number; wasPinch: boolean; moved: boolean }>();
    let pinch: { distance: number; zoom: number } | null = null;
    const zoomRange = Math.log(distances.far / distances.near);

    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest("[data-globe-interactive]")) return;
      stopAnimation();
      stage.style.cursor = "";
      stage.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      starts.set(event.pointerId, { x: event.clientX, y: event.clientY, wasPinch: false, moved: false });
      if (pointers.size === 2) {
        pinch = { distance: spread(), zoom: zoomRef.current };
        starts.forEach((start) => { start.wasPinch = true; });
      }
      stage.dataset.dragging = "true";
    };

    const onMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) {
        const hovered = pickMarker(event.clientX, event.clientY);
        stage.style.cursor = hovered ? "pointer" : "";
        const hadPoint = hoverPointRef.current !== null;
        hoverPointRef.current = hovered ? { x: event.clientX, y: event.clientY } : null;
        if (hovered || hadPoint) syncCityLabels();
        return;
      }
      const start = starts.get(event.pointerId);
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 7) start.moved = true;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        viewRef.current = panView(
          viewRef.current,
          event.clientX - previous.x,
          event.clientY - previous.y,
          size.height,
          VERTICAL_FOV
        );
        applyView();
        syncAutoGroup();
      } else if (pointers.size === 2 && pinch) {
        setZoomLevel(pinch.zoom + Math.log(spread() / pinch.distance) / zoomRange);
      }
    };

    const onUp = (event: PointerEvent) => {
      const start = starts.get(event.pointerId);
      const isClick = event.type === "pointerup" && start && !start.wasPinch && !start.moved &&
        pointers.size === 1;
      pointers.delete(event.pointerId);
      starts.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) delete stage.dataset.dragging;
      if (isClick) {
        const marker = pickMarker(event.clientX, event.clientY);
        if (marker?.kind === "performer") setSelectedPerformerId(marker.id);
        else if (marker?.kind === "group") animateFocusTo(marker.expanded ? null : marker.cityId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      // Сторінка під картою не скролиться: колесо тут означає масштаб.
      event.preventDefault();
      stopAnimation();
      setZoomLevel(zoomRef.current - event.deltaY * 0.0012);
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    const onLeave = () => {
      if (!hoverPointRef.current) return;
      hoverPointRef.current = null;
      syncCityLabels();
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, [animateFocusTo, applyView, distances, pickMarker, setZoomLevel, size, syncAutoGroup, syncCityLabels]);

  useEffect(() => stopAnimation, []);

  useEffect(() => {
    if (!expandedCityId && !selectedPerformerId) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedPerformerId) setSelectedPerformerId(null);
      else animateFocusTo(null);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [animateFocusTo, expandedCityId, selectedPerformerId]);

  const polygons = useMemo(() => [ukraine], []);

  const peopleByCity = useMemo(() => {
    const groups = new Map<string, Performer[]>();
    for (const performer of DEMO_PERFORMERS) {
      const group = groups.get(performer.cityId) ?? [];
      group.push(performer);
      groups.set(performer.cityId, group);
    }
    return groups;
  }, []);

  const visualMarkers = useMemo<VisualMarker[]>(
    () => {
      const people: VisualMarker[] = [];
      for (const city of CITIES) {
        const members = peopleByCity.get(city.id) ?? [];
        if (members.length >= GROUP_MIN) {
          people.push({
            kind: "group",
            id: `group-${city.id}`,
            cityId: city.id,
            name: city.name,
            lat: city.lat,
            lng: city.lng,
            count: members.length,
            previews: members.slice(0, 2).map((member) => member.avatarIndex),
            expanded: city.id === expandedCityId,
          });
        }
        if (members.length < GROUP_MIN || city.id === expandedCityId) {
          people.push(
            ...members.map((member) => ({
              kind: "performer" as const,
              ...member,
              selected: member.id === selectedPerformerId,
            }))
          );
        }
      }
      return people;
    },
    [expandedCityId, peopleByCity, selectedPerformerId]
  );

  const htmlMarkers = useMemo<HtmlMarker[]>(
    () => [
        ...DEMO_REQUESTS.map((request) => ({ kind: "request" as const, ...request })),
        ...CITIES.filter((city) => city.label).map((city) => ({
          kind: "city" as const,
          ...city,
          grouped: (peopleByCity.get(city.id)?.length ?? 0) >= GROUP_MIN,
        })),
    ],
    [peopleByCity]
  );

  const htmlElement = useCallback((datum: object) => createMarkerElement(datum as HtmlMarker), []);

  const customThreeObject = useCallback((datum: object) => {
    if (!markerAssets || !size) return new Object3D();
    const sprite = createMarkerSprite(markerAssets, datum as VisualMarker);
    const globe = globeRef.current;
    if (globe) {
      const distance = viewRef.current.distance;
      const altitude = plateauAltitude(distance, PLATEAU_ALTITUDE, PLATEAU_FULL_DISTANCE);
      placeMarkerSprite(sprite, globe.camera() as PerspectiveCamera, size.height, altitude, size.width < 640);
    }
    markerSpritesRef.current.add(sprite);
    return sprite;
  }, [markerAssets, size]);

  const customThreeObjectUpdate = useCallback((object: Object3D, datum: object) => {
    if (!(object instanceof Sprite) || !markerAssets || !size) return;
    const marker = datum as VisualMarker;
    object.userData.marker = marker;
    object.material.map = markerTexture(markerAssets, marker);
    object.material.needsUpdate = true;
    object.center.set(0.5, marker.kind === "performer" ? 0.12 : 0.5);
    object.renderOrder = marker.kind === "group" && marker.expanded ? 30 : 20;
    const globe = globeRef.current;
    if (!globe) return;
    const altitude = plateauAltitude(viewRef.current.distance, PLATEAU_ALTITUDE, PLATEAU_FULL_DISTANCE);
    placeMarkerSprite(object, globe.camera() as PerspectiveCamera, size.height, altitude, size.width < 640);
  }, [markerAssets, size]);

  const selectedPerformer = DEMO_PERFORMERS.find((person) => person.id === selectedPerformerId);
  const expandedCity = CITIES.find((city) => city.id === expandedCityId);

  const visible = globeReady && Boolean(materials) && Boolean(distances);

  // Серверна заставка ховається, щойно глобус намальований.
  useEffect(() => {
    setMapReady(visible);
    return () => setMapReady(false);
  }, [visible]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={stageRef}
        aria-label="Карта виконавців і запитів в Україні"
        role="region"
        className="absolute inset-0 cursor-grab touch-none select-none transition-opacity duration-700 data-[dragging=true]:cursor-grabbing"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {size && materials && (
          <Globe
            ref={globeRef}
            width={size.width}
            height={size.height}
            rendererConfig={RENDERER_CONFIG}
            animateIn={false}
            backgroundColor="rgba(0,0,0,0)"
            globeMaterial={materials.surface}
            globeCurvatureResolution={1}
            showAtmosphere
            atmosphereColor="#dfe7f4"
            atmosphereAltitude={0.08}
            enablePointerInteraction={false}
            onGlobeReady={onGlobeReady}
            polygonsData={polygons}
            polygonAltitude={PLATEAU_ALTITUDE}
            polygonCapMaterial={materials.cap}
            polygonSideMaterial={materials.side}
            polygonStrokeColor={polygonStrokeColor}
            polygonCapCurvatureResolution={1}
            polygonsTransitionDuration={0}
            customLayerData={markerAssets ? visualMarkers : []}
            customThreeObject={customThreeObject}
            customThreeObjectUpdate={customThreeObjectUpdate}
            htmlElementsData={htmlMarkers}
            htmlElement={htmlElement}
            htmlAltitude={PLATEAU_ALTITUDE}
            htmlTransitionDuration={0}
          />
        )}
      </div>

      {(expandedCity || selectedPerformer) && (
        <div className="absolute bottom-20 left-4 z-[var(--z-controls)] w-[min(330px,calc(100vw-32px))] rounded-2xl bg-white/95 p-4 shadow-[0_16px_50px_-18px_rgb(22_48_112/0.38)] ring-1 ring-brand/15 backdrop-blur-md sm:bottom-6 sm:left-6">
          {selectedPerformer ? (
            <div className="flex items-center gap-3">
              <span
                className="globe-profile-photo shrink-0"
                style={{ backgroundPosition: avatarPosition(selectedPerformer.avatarIndex) }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{selectedPerformer.name}</p>
                <p className="text-xs text-ink-muted">{selectedPerformer.specialty}</p>
                <p className="mt-1 text-[11px] text-brand">
                  {CITIES.find((city) => city.id === selectedPerformer.cityId)?.name} · демопрофіль
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPerformerId(null)}
                aria-label="Закрити картку"
                className="ml-auto self-start rounded-full px-1.5 text-lg leading-none text-ink-muted hover:text-ink"
              >
                ×
              </button>
            </div>
          ) : expandedCity ? (
            <div>
              <p className="pr-8 text-sm font-semibold text-ink">
                {expandedCity.name} · {peopleByCity.get(expandedCity.id)?.length} виконавців
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Оберіть портрет або натисніть × на групі, щоб згорнути її.
              </p>
            </div>
          ) : null}
          {expandedCity && (
            <button
              type="button"
              onClick={() => animateFocusTo(null)}
              className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 text-xs font-semibold text-white shadow-[0_6px_18px_-7px_rgb(27_91_223/70%)] transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden>×</span> Згорнути групу · вся Україна
            </button>
          )}
        </div>
      )}

      <GlobeZoomControl
        value={zoom}
        onChange={(value) => {
          stopAnimation();
          setZoomLevel(value);
        }}
        onStep={(direction) => animateZoomTo(zoomRef.current + direction * 0.2)}
      />
    </div>
  );
}
