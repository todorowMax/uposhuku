import { ukraineOutline } from "@/lib/map/outline";

/**
 * Заставка карти, яку рендерить сервер: приходить у першому HTML, тож
 * видна до завантаження будь-якого JS (MapLibre, React). Анімація
 * на CSS з тієї ж причини: контур малюється пером, проявляється заливка,
 * по країні біжить відблиск, як у скелетона, міста спалахують по черзі.
 *
 * Ховається, коли карта готова: сцена ставить <html data-map-ready>
 * (lib/map/ready.ts), решту робить CSS.
 */
export function MapSkeleton() {
  const { width, height, path, cities } = ukraineOutline();
  return (
    <div role="status" aria-live="polite" className="map-skeleton">
      <svg viewBox={`0 0 ${width} ${height.toFixed(0)}`} className="map-skeleton-svg" aria-hidden>
        <defs>
          <clipPath id="map-skeleton-clip">
            <path d={path} />
          </clipPath>
          <linearGradient id="map-skeleton-shine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g clipPath="url(#map-skeleton-clip)">
          <rect className="map-skeleton-fill" width={width} height={height} />
          <g className="map-skeleton-shine">
            <rect
              y={-20}
              width={width * 0.45}
              height={height + 40}
              fill="url(#map-skeleton-shine)"
              transform="skewX(-18)"
            />
          </g>
        </g>
        <path className="map-skeleton-outline" d={path} pathLength={1} />
        {cities.map((city, index) => (
          <g key={city.id} style={{ "--i": index } as React.CSSProperties}>
            <circle className="map-skeleton-ring" cx={city.x} cy={city.y} r={5} />
            <circle className="map-skeleton-city" cx={city.x} cy={city.y} r={5} />
          </g>
        ))}
      </svg>
      <p className="map-skeleton-label">
        Мапа підвантажується
        <span aria-hidden className="map-skeleton-dots">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
    </div>
  );
}
