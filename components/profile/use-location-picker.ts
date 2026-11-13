"use client";

// components/profile/use-location-picker.ts
//
// Карта вибору точки: стиль, клік ставить точку, маркер можна перетягнути. Перенесено з компонента без змін поведінки;
// розмітка в `location-picker.tsx`.

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { CITIES } from "@/lib/map/cities";
import { nearestCity } from "@/lib/map/nearest-city";
import type { GeoPoint } from "@/lib/map/types";
import { PLACE_LABEL_LAYERS } from "@/lib/maplibre/place-labels";
import { buildMapStyle } from "@/lib/maplibre/style";

export namespace LocationPickerTypes {
  export type Point = { lat: number; lng: number };
}

type Point = LocationPickerTypes.Point;

const UKRAINE_VIEW = { center: [31.2, 48.9] as [number, number], zoom: 5.2 };
const BOUNDS: [[number, number], [number, number]] = [
  [21.5, 43.8],
  [41.2, 53],
];

const pickStyle = () => {
  const style = buildMapStyle(window.location.origin);
  return {
    ...style,
    projection: { type: "mercator" as const },
    sky: undefined,
    layers: [
      // Назви вулиць тут потрібні раніше, ніж на головній.
      ...style.layers.map((layer) =>
        layer.id === "street-names" ? { ...layer, minzoom: 13 } : layer,
      ),
      ...PLACE_LABEL_LAYERS,
    ],
  };
};

const marker = () => {
  const element = document.createElement("div");
  element.className = "loc-pin";
  element.innerHTML = '<span class="loc-pin-dot"></span>';
  return element;
};

export const useLocationPicker = (initial: Point | null, cityId: string) => {
  // Контейнер карти з'являється в порталі пізніше за компонент, тому тримаємо його в стані, а не в ref.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [draft, setDraft] = useState<Point | null>(initial);
  const [failed, setFailed] = useState(false);
  // Початковий вигляд задаємо один раз; далі карту веде людина.
  const [origin] = useState({ initial, cityId });

  useEffect(() => {
    if (!container) return;
    const city = CITIES.find((item) => item.id === origin.cityId);
    const start = origin.initial ?? city;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        // Той самий стиль, що на головній (наші текстури, вулиці, будинки), але плоский:
        // без глобуса й неба, щоб точку було легко поставити.
        style: pickStyle(),
        pitch: 0,
        maxPitch: 0,
        center: start ? [start.lng, start.lat] : UKRAINE_VIEW.center,
        zoom: origin.initial ? 13 : city ? 10.5 : UKRAINE_VIEW.zoom,
        minZoom: 5,
        maxZoom: 18,
        maxBounds: BOUNDS,
        attributionControl: { compact: true },
      });
    } catch {
      // Без WebGL карта не створюється: повідомляємо вже після ефекту, не під час нього.
      queueMicrotask(() => setFailed(true));
      return;
    }
    mapRef.current = map;
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("click", (event) =>
      setDraft({ lat: event.lngLat.lat, lng: event.lngLat.lng }),
    );
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [container, origin]);

  // Маркер повторює чернетку: поставили, перетягнули, зняли.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draft) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const pin = new maplibregl.Marker({
        element: marker(),
        draggable: true,
        anchor: "bottom",
      })
        .setLngLat([draft.lng, draft.lat])
        .addTo(map);
      pin.on("dragend", () => {
        const { lat, lng } = pin.getLngLat();
        setDraft({ lat, lng });
      });
      markerRef.current = pin;
    } else {
      markerRef.current.setLngLat([draft.lng, draft.lat]);
    }
  }, [draft, container]);

  const near = draft ? nearestCity(draft as GeoPoint) : null;
  const changed =
    (draft?.lat ?? null) !== (initial?.lat ?? null) ||
    (draft?.lng ?? null) !== (initial?.lng ?? null);
  const removing = !draft && Boolean(initial);

  return { setContainer, draft, setDraft, failed, near, changed, removing };
};
