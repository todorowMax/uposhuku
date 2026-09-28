import { describe, expect, it } from "vitest";
import { CITIES } from "@/lib/map/cities";
import { DEMO_MATCHES, DEMO_PERFORMERS, DEMO_REQUESTS } from "@/lib/map/demo";
import { inUkraine } from "@/lib/map/geo";
import { distanceKm, offsetKm, placeNear, scatterAround } from "@/lib/map/scatter";

describe("контур України", () => {
  // Кордони з версії Natural Earth з погляду України. Звичайна версія
  // віддає Крим Росії, і цей тест ловить, якщо хтось перемалює з неї.
  it("включає Крим", () => {
    expect(inUkraine({ lat: 44.95, lng: 34.1 })).toBe(true); // Сімферополь
    expect(inUkraine({ lat: 44.6, lng: 33.52 })).toBe(true); // Севастополь
  });

  it("не захоплює сусідів", () => {
    expect(inUkraine({ lat: 53.9, lng: 27.56 })).toBe(false); // Мінськ
    expect(inUkraine({ lat: 47.01, lng: 28.86 })).toBe(false); // Кишинів
  });

  it("містить усі міста зі списку", () => {
    for (const city of CITIES) expect(inUkraine(city), city.name).toBe(true);
  });
});

describe("scatterAround", () => {
  const center = { lat: 50.45, lng: 30.52 };

  it("дає стільки точок, скільки просили, і щоразу ті самі", () => {
    const points = scatterAround(center, 9, 10);
    expect(points).toHaveLength(9);
    expect(scatterAround(center, 9, 10)).toEqual(points);
  });

  it("пропускає місця, які не підходять", () => {
    const odesa = { lat: 46.4825, lng: 30.7233 };
    const points = scatterAround(odesa, 6, 10, inUkraine);
    expect(points).toHaveLength(6);
    for (const point of points) expect(inUkraine(point)).toBe(true);
  });

  it("тримає купку в межах міста й без накладань", () => {
    const points = scatterAround(center, 9, 10);
    for (const point of points) expect(distanceKm(center, point)).toBeLessThanOrEqual(10 * Math.sqrt(9) + 0.1);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(distanceKm(points[i], points[j])).toBeGreaterThan(5);
      }
    }
  });
});

describe("placeNear", () => {
  it("обходить море, повертаючи напрямок", () => {
    const odesa = { lat: 46.4825, lng: 30.7233 };
    const point = placeNear(odesa, 20, -60, inUkraine);
    expect(inUkraine(point)).toBe(true);
    expect(distanceKm(odesa, point)).toBeCloseTo(20, 0);
  });
});

describe("offsetKm", () => {
  it("зсуває на задану відстань", () => {
    const origin = { lat: 49, lng: 31 };
    expect(distanceKm(origin, offsetKm(origin, 30, 40))).toBeCloseTo(50, 0);
  });
});

describe("демо-дані", () => {
  it("усі виконавці й запити стоять на суходолі України", () => {
    for (const point of [...DEMO_PERFORMERS, ...DEMO_REQUESTS]) {
      expect(inUkraine(point), "id" in point ? point.id : "").toBe(true);
    }
  });

  it("кожен збіг веде до наявних запиту й виконавця", () => {
    const performers = new Set(DEMO_PERFORMERS.map((performer) => performer.id));
    const requests = new Set(DEMO_REQUESTS.map((request) => request.id));
    for (const match of DEMO_MATCHES) {
      expect(performers.has(match.performerId), match.performerId).toBe(true);
      expect(requests.has(match.requestId), match.requestId).toBe(true);
    }
  });

  it("свіжий запит рівно один", () => {
    expect(DEMO_REQUESTS.filter((request) => request.live)).toHaveLength(1);
  });
});
