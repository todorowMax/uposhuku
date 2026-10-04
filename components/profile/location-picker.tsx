"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Check, Eraser, MapPin, X } from "@/components/icons";
import { CITIES } from "@/lib/map/cities";
import { nearestCity } from "@/lib/map/nearest-city";
import type { GeoPoint } from "@/lib/map/types";
import { PLACE_LABEL_LAYERS } from "@/lib/maplibre/place-labels";
import { buildMapStyle } from "@/lib/maplibre/style";

type Point = { lat: number; lng: number };

const UKRAINE_VIEW = { center: [31.2, 48.9] as [number, number], zoom: 5.2 };
const BOUNDS: [[number, number], [number, number]] = [[21.5, 43.8], [41.2, 53]];

const pickStyle = () => {
  const style = buildMapStyle(window.location.origin);
  return { ...style, projection: { type: "mercator" as const }, sky: undefined,
    layers: [
      // Назви вулиць тут потрібні раніше, ніж на головній.
      ...style.layers.map((layer) => (layer.id === "street-names" ? { ...layer, minzoom: 13 } : layer)),
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

/**
 * Вибір точки на карті. Карту можна наближати й рухати, клік ставить точку,
 * її можна перетягнути. «Зняти» прибирає чернетку точки, «Підтвердити»
 * віддає її профілю. Поки не підтвердили, нічого не збережено: випадкове
 * тикання не псує профіль.
 */
export function LocationPicker({
  initial,
  cityId,
  onConfirm,
  onClose,
}: {
  initial: Point | null;
  cityId: string;
  onConfirm: (point: Point | null) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [draft, setDraft] = useState<Point | null>(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const city = CITIES.find((item) => item.id === cityId);
    const start = initial ?? city;
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
        zoom: initial ? 13 : city ? 10.5 : UKRAINE_VIEW.zoom,
        minZoom: 5,
        maxZoom: 18,
        maxBounds: BOUNDS,
        attributionControl: { compact: true },
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (event) => setDraft({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Початковий вигляд задаємо один раз; далі карту веде людина.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const pin = new maplibregl.Marker({ element: marker(), draggable: true, anchor: "bottom" }).setLngLat([draft.lng, draft.lat]).addTo(map);
      pin.on("dragend", () => {
        const { lat, lng } = pin.getLngLat();
        setDraft({ lat, lng });
      });
      markerRef.current = pin;
    } else {
      markerRef.current.setLngLat([draft.lng, draft.lat]);
    }
  }, [draft]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const near = draft ? nearestCity(draft as GeoPoint) : null;
  const changed = (draft?.lat ?? null) !== (initial?.lat ?? null) || (draft?.lng ?? null) !== (initial?.lng ?? null);
  const removing = !draft && Boolean(initial);

  return (
    <div role="dialog" aria-modal="true" aria-label="Точка на карті" className="loc-overlay">
      <header className="pe-header">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold text-ink">Де вас показувати</h2>
          <p className="mt-0.5 text-[12px] text-ink-muted">Наблизьте карту й торкніться місця. Точку можна перетягнути.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрити без збереження" className="auth-icon-button shrink-0">
          <X className="size-5" />
        </button>
      </header>

      <div className="loc-map-wrap">
        <div ref={containerRef} className="loc-map" />
        {failed && <p className="loc-fail">Карта не завантажилась. Закрийте вікно й оберіть місто зі списку.</p>}
        {!draft && !failed && <p className="loc-hint">Торкніться карти, щоб поставити точку</p>}
      </div>

      <footer className="loc-footer">
        <p className="loc-note">
          <MapPin className="size-4 shrink-0" />
          {draft && near ? (
            <span>
              {draft.lat.toFixed(3)}, {draft.lng.toFixed(3)} · найближче місто: {near.city.name}. Точку побачать усі, тож ставте її приблизно, а не біля дверей.
            </span>
          ) : (
            <span>Без точки ми поставимо вас біля центру вашого міста.</span>
          )}
        </p>
        <div className="loc-actions">
          <button type="button" onClick={() => onConfirm(draft)} disabled={!changed} className="auth-primary">
            <Check className="size-4" />
            {removing ? "Прибрати точку" : "Підтвердити"}
          </button>
          <button type="button" onClick={() => setDraft(null)} disabled={!draft} className="auth-secondary">
            <Eraser className="size-4" />
            Зняти точку
          </button>
          <button type="button" onClick={onClose} className="auth-secondary">
            Скасувати
          </button>
        </div>
      </footer>
    </div>
  );
}
