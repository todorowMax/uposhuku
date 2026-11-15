"use client";

// components/maplibre/use-touch-sheets.ts
//
// Тап по маркеру на пристрої без наведення (телефон, планшет): група відкриває шторку зі списком людей,
// одиночний портрет — шторку з короткою карткою. Два тапи поспіль лишаються подвійним тапом MapLibre
// (наближення), тож шторка відкривається з невеликою затримкою: модальна шторка закрила б карту
// від другого тапу. Початок масштабування (подвійний тап, щипок, «Наблизити») закриває шторку.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { Point } from "geojson";
import type { MapRequest } from "@/lib/feed/types";
import type { Performer } from "@/lib/map/types";
import { EVENTS, track } from "@/lib/telemetry/track";

/** Скільки чекаємо другого тапу, перш ніж відкрити шторку. */
export const DOUBLE_TAP_WAIT_MS = 300;
const ZOOM_AFTER_EXPAND = 0.3;
const ZOOM_FLIGHT_MS = 620;

/** Політ камери зі сцени (з урахуванням меж панорами): карта, центр, масштаб, тривалість. */
type FlyTo = (map: MapLibreMap, ...flight: [center: [number, number], zoom: number, duration: number]) => void;

export namespace TouchSheetsTypes {
  export interface Group {
    members: Performer[];
    requests: MapRequest[];
    feature: MapGeoJSONFeature;
  }
  export type State = { kind: "group"; group: Group } | { kind: "pin"; performer: Performer } | null;
  export interface Handlers {
    /** Забрати вибрану людину й запит перед наближенням до групи. */
    clearSelection: () => void;
  }
  export interface Options {
    mapRef: RefObject<MapLibreMap | null>;
    mapReady: boolean;
    people: RefObject<Performer[]>;
    requests: RefObject<MapRequest[]>;
    handlers: RefObject<Handlers>;
    flyToRef: RefObject<FlyTo | null>;
  }
}

export const useTouchSheets = ({ mapRef, mapReady, people, requests, handlers, flyToRef }: TouchSheetsTypes.Options) => {
  const [state, setState] = useState<TouchSheetsTypes.State>(null);
  const waitRef = useRef(0);

  const cancelWait = useCallback(() => {
    window.clearTimeout(waitRef.current);
    waitRef.current = 0;
  }, []);
  const close = useCallback(() => setState(null), []);

  const openGroup = useCallback(
    async (feature: MapGeoJSONFeature) => {
      const map = mapRef.current;
      if (!map) return;
      const clusterId = feature.properties?.cluster_id as number;
      const leaves = await (map.getSource("people") as GeoJSONSource).getClusterLeaves(clusterId, Infinity, 0).catch(() => []);
      const ids = new Set(leaves.map((leaf) => leaf.properties?.id as string));
      const requestIds = new Set(leaves.map((leaf) => leaf.properties?.rid as string));
      const members = people.current.filter((performer) => ids.has(performer.id)).sort((a, b) => b.tier - a.tier);
      const own = requests.current.filter((request) => requestIds.has(request.id));
      if (members.length + own.length === 0) return;
      setState({ kind: "group", group: { members, requests: own, feature } });
    },
    [mapRef, people, requests]
  );

  const openPin = useCallback(
    (feature: MapGeoJSONFeature) => {
      const performer = people.current.find((item) => item.id === feature.properties?.id);
      if (!performer) return;
      track(EVENTS.markerClicked, { tier: performer.tier });
      setState({ kind: "pin", performer });
    },
    [people]
  );

  /** Тап по людині чи групі. Другий тап за мить скасовує відкриття: це подвійний тап. */
  const tap = useCallback(
    (feature: MapGeoJSONFeature) => {
      if (waitRef.current) {
        cancelWait();
        return;
      }
      waitRef.current = window.setTimeout(() => {
        waitRef.current = 0;
        if (feature.layer.id === "people-clusters") void openGroup(feature);
        else openPin(feature);
      }, DOUBLE_TAP_WAIT_MS);
    },
    [cancelWait, openGroup, openPin]
  );

  /** «Наблизити» в шапці шторки: те, що раніше робив тап по групі. */
  const zoomGroup = useCallback(
    async (feature: MapGeoJSONFeature) => {
      const map = mapRef.current;
      const flyTo = flyToRef.current;
      if (!map || !flyTo) return;
      track(EVENTS.groupClicked, { size: Number(feature.properties?.point_count) || 0 });
      handlers.current.clearSelection();
      setState(null);
      const zoom = await (map.getSource("people") as GeoJSONSource).getClusterExpansionZoom(feature.properties?.cluster_id as number);
      flyTo(map, (feature.geometry as Point).coordinates as [number, number], zoom + ZOOM_AFTER_EXPAND, ZOOM_FLIGHT_MS);
    },
    [mapRef, flyToRef, handlers]
  );

  // Масштабування карти (подвійний тап, щипок) скасовує очікування й закриває відкриту шторку.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const onZoomStart = () => {
      cancelWait();
      setState(null);
    };
    map.on("zoomstart", onZoomStart);
    return () => {
      map.off("zoomstart", onZoomStart);
      cancelWait();
    };
  }, [mapRef, mapReady, cancelWait]);

  return { state, tap, close, zoomGroup };
};
