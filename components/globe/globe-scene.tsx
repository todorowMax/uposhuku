"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import {
  AmbientLight,
  ClampToEdgeWrapping,
  DirectionalLight,
  SRGBColorSpace,
  TextureLoader,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
} from "three";
import { GlobeClouds } from "@/components/globe/clouds";
import { GlobeZoomControl } from "@/components/globe/zoom-control";
import {
  cameraPose,
  fitDistance,
  localFrame,
  panView,
  plateauAltitude,
  zoomToDistance,
  type MapView,
} from "@/lib/globe/camera";
import ukraine from "@/lib/globe/data/ukraine.geo.json";
import { createMarkerElement, type HtmlMarker } from "@/lib/globe/html";
import { createPyramid, createPyramidGeometry, placeOnSurface } from "@/lib/globe/markers";
import {
  createCapMaterial,
  createPerformerMaterial,
  createSideMaterial,
  createSurfaceMaterial,
} from "@/lib/globe/materials";
import { GLOBE_PALETTE } from "@/lib/globe/palette";
import { CITIES } from "@/lib/map/cities";
import { DEMO_MATCHES, DEMO_PERFORMERS, DEMO_REQUESTS } from "@/lib/map/demo";
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
/** Товщина дуг на повній висоті плато, кутові градуси. */
const ARC_STROKE = 0.035;
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
 * Зсув кадру вниз, частка висоти. Україна стоїть трохи нижче центру:
 * над нею лишається небо й вигин горизонту, куди згодом ляже поле
 * запиту.
 */
const FRAME_SHIFT = 0.08;
/** Центр країни, куди дивиться камера на старті. */
const START = { lat: 48.1, lng: 31.4 };
/** Ширина пірамідки на екрані, CSS-пікселі, на будь-якому масштабі. */
const PYRAMID_PX = 13;
/** Довжина одного штриха дуги, км: однакова на короткій і довгій дузі. */
const DASH_KM = 9;

interface Size {
  width: number;
  height: number;
}

interface ArcDatum {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  lengthKm: number;
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
const arcColor = () => GLOBE_PALETTE.arc;
const arcDashLength = (datum: object) => DASH_KM / (datum as ArcDatum).lengthKm;
const arcDashGap = (datum: object) => (DASH_KM * 0.8) / (datum as ArcDatum).lengthKm;
const arcDashAnimateTime = (datum: object) => (datum as ArcDatum).lengthKm * 14;
const htmlElement = (datum: object) => createMarkerElement(datum as HtmlMarker);

export default function GlobeScene() {
  const stageRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState<Size | null>(null);
  const [textures, setTextures] = useState<{ world: Texture; region: Texture } | null>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  // Висота, на якій стоять підписи й дуги. Оновлюється з кроком масштабу,
  // а не щокадру: це перебудова шарів globe.gl, хоч і дешева.
  const [markerAltitude, setMarkerAltitude] = useState(PLATEAU_ALTITUDE);
  const plateauRef = useRef<Object3D | null>(null);
  const zoomRef = useRef(0);
  const viewRef = useRef<MapView>({ ...START, distance: 20, tilt: TILT_DEG });
  const pyramidsRef = useRef(new Set<Mesh>());
  /** Поточний масштаб пірамідки: нові маркери одразу потрібного розміру. */
  const pyramidScaleRef = useRef(0.2);
  const animationRef = useRef<number | null>(null);

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

  const pyramid = useMemo(
    () => ({ geometry: createPyramidGeometry(), material: createPerformerMaterial() }),
    []
  );

  /** Межі наближення залежать від пропорцій екрана. */
  const distances = useMemo(() => {
    if (!size) return null;
    const aspect = size.width / size.height;
    const frameKm = aspect < 1 ? UKRAINE_FRAME_KM_NARROW : UKRAINE_FRAME_KM;
    const far = fitDistance(frameKm, aspect, VERTICAL_FOV);
    return { far, near: Math.min(CITY_DISTANCE, far * 0.5) };
  }, [size]);

  const unitsPerPixel = useCallback(
    (distance: number) =>
      size ? (2 * distance * Math.tan(((VERTICAL_FOV / 2) * Math.PI) / 180)) / size.height : 0,
    [size]
  );

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

    const scale = unitsPerPixel(view.distance) * PYRAMID_PX;
    pyramidScaleRef.current = scale;
    pyramidsRef.current.forEach((mesh) => {
      placeOnSurface(mesh, mesh.userData.point as Performer, altitude);
      mesh.scale.setScalar(scale);
    });

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

    // globe.gl перераховує видимість підписів на цю подію: без неї
    // HTML-шар не знає, що камера зрушила.
    globe.controls().dispatchEvent({ type: "change" });
  }, [size, unitsPerPixel]);

  const setZoomLevel = useCallback(
    (next: number) => {
      if (!distances) return;
      const clamped = Math.min(1, Math.max(0, next));
      zoomRef.current = clamped;
      setZoom(clamped);
      const distance = zoomToDistance(clamped, distances.far, distances.near);
      viewRef.current = { ...viewRef.current, distance };
      applyView();
      // Три значущі цифри: дрібніші зміни на екрані не видно, а кожна
      // зміна перебудовує підписи й дуги.
      setMarkerAltitude(
        Number(plateauAltitude(distance, PLATEAU_ALTITUDE, PLATEAU_FULL_DISTANCE).toPrecision(3))
      );
    },
    [applyView, distances]
  );

  const stopAnimation = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
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

    // Світло з північного заходу й згори: ліва грань пірамідки світла,
    // права в тіні, як у знаку.
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
    let pinch: { distance: number; zoom: number } | null = null;
    const zoomRange = Math.log(distances.far / distances.near);

    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (event: PointerEvent) => {
      stopAnimation();
      stage.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) pinch = { distance: spread(), zoom: zoomRef.current };
      stage.dataset.dragging = "true";
    };

    const onMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
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
      } else if (pointers.size === 2 && pinch) {
        setZoomLevel(pinch.zoom + Math.log(spread() / pinch.distance) / zoomRange);
      }
    };

    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) delete stage.dataset.dragging;
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
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("wheel", onWheel);
    };
  }, [applyView, distances, setZoomLevel, size]);

  useEffect(() => stopAnimation, []);

  const polygons = useMemo(() => [ukraine], []);

  const htmlMarkers = useMemo<HtmlMarker[]>(
    () => [
      ...DEMO_REQUESTS.map((request) => ({ kind: "request" as const, ...request })),
      ...CITIES.filter((city) => city.label).map((city) => ({ kind: "city" as const, ...city })),
      { kind: "country", id: "ua", name: "Україна", lat: 48.95, lng: 31.1 },
    ],
    []
  );

  const arcs = useMemo<ArcDatum[]>(() => {
    const requests = new Map(DEMO_REQUESTS.map((request) => [request.id, request]));
    const performers = new Map(DEMO_PERFORMERS.map((performer) => [performer.id, performer]));
    return DEMO_MATCHES.flatMap((match) => {
      const from = requests.get(match.requestId);
      const to = performers.get(match.performerId);
      if (!from || !to) return [];
      return [
        {
          startLat: from.lat,
          startLng: from.lng,
          endLat: to.lat,
          endLng: to.lng,
          lengthKm: distanceKm(from, to),
        },
      ];
    });
  }, []);

  const reducedMotion = useMemo(prefersReducedMotion, []);

  const createPerformerObject = useCallback(
    (datum: object) => {
      const mesh = createPyramid(
        pyramid.geometry,
        pyramid.material,
        datum as Performer,
        PLATEAU_ALTITUDE
      );
      mesh.userData.point = datum;
      mesh.scale.setScalar(pyramidScaleRef.current);
      pyramidsRef.current.add(mesh);
      // Шар прибирає маркер зі сцени, коли даних стає менше: тоді й ми
      // перестаємо його рухати.
      mesh.addEventListener("removed", () => pyramidsRef.current.delete(mesh));
      return mesh;
    },
    [pyramid]
  );

  const visible = globeReady && Boolean(materials) && Boolean(distances);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={stageRef}
        aria-label="Карта виконавців і запитів в Україні"
        role="img"
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
            customLayerData={DEMO_PERFORMERS}
            customThreeObject={createPerformerObject}
            htmlElementsData={htmlMarkers}
            htmlElement={htmlElement}
            htmlAltitude={markerAltitude}
            htmlTransitionDuration={0}
            arcsData={arcs}
            arcColor={arcColor}
            arcStroke={(ARC_STROKE * markerAltitude) / PLATEAU_ALTITUDE}
            arcStartAltitude={markerAltitude}
            arcEndAltitude={markerAltitude}
            arcAltitudeAutoScale={0.22}
            arcDashLength={arcDashLength}
            arcDashGap={arcDashGap}
            arcDashAnimateTime={reducedMotion ? 0 : arcDashAnimateTime}
            arcsTransitionDuration={reducedMotion ? 0 : 1200}
          />
        )}
      </div>

      <GlobeClouds />

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
