import { describe, expect, it } from "vitest";
import {
  GLOBE_RADIUS,
  KM_PER_UNIT,
  cameraPose,
  fitDistance,
  geoToCartesian,
  localFrame,
  panView,
  plateauAltitude,
  zoomToDistance,
  type MapView,
} from "@/lib/globe/camera";
import { UKRAINE_BOUNDS } from "@/lib/globe/region";

const KYIV: MapView = { lat: 50.45, lng: 30.52, distance: 17, tilt: 38 };

describe("geoToCartesian", () => {
  // Ті самі осі, що в three-globe: інакше камера дивитиметься повз маркери.
  it("кладе нульовий меридіан на вісь Z, полюс на Y, 90° сх. на X", () => {
    const origin = geoToCartesian(0, 0);
    expect(origin.x).toBeCloseTo(0);
    expect(origin.y).toBeCloseTo(0);
    expect(origin.z).toBeCloseTo(GLOBE_RADIUS);
    expect(geoToCartesian(90, 0).y).toBeCloseTo(GLOBE_RADIUS);
    expect(geoToCartesian(0, 90).x).toBeCloseTo(GLOBE_RADIUS);
  });

  it("піднімає точку на частку радіуса", () => {
    expect(geoToCartesian(48, 31, 0.01).length()).toBeCloseTo(GLOBE_RADIUS * 1.01);
  });
});

describe("localFrame", () => {
  it("дає ортонормований базис", () => {
    const { up, north, east } = localFrame(49, 31);
    expect(up.length()).toBeCloseTo(1);
    expect(north.length()).toBeCloseTo(1);
    expect(east.length()).toBeCloseTo(1);
    expect(up.dot(north)).toBeCloseTo(0);
    expect(up.dot(east)).toBeCloseTo(0);
    expect(north.dot(east)).toBeCloseTo(0);
  });

  it("north і east дивляться туди, де ростуть широта й довгота", () => {
    const { north, east } = localFrame(49, 31);
    const here = geoToCartesian(49, 31);
    expect(geoToCartesian(49.01, 31).sub(here).dot(north)).toBeGreaterThan(0);
    expect(geoToCartesian(49, 31.01).sub(here).dot(east)).toBeGreaterThan(0);
  });
});

describe("cameraPose", () => {
  it("ставить камеру на заданій відстані й під заданим нахилом", () => {
    const pose = cameraPose(KYIV);
    const offset = pose.position.clone().sub(pose.target);
    expect(offset.length()).toBeCloseTo(KYIV.distance);
    const { up } = localFrame(KYIV.lat, KYIV.lng);
    const tilt = (Math.acos(offset.clone().normalize().dot(up)) * 180) / Math.PI;
    expect(tilt).toBeCloseTo(KYIV.tilt);
  });

  it("камера на півдні від фокуса й дивиться на північ", () => {
    const pose = cameraPose(KYIV);
    const { north } = localFrame(KYIV.lat, KYIV.lng);
    expect(pose.position.clone().sub(pose.target).dot(north)).toBeLessThan(0);
  });

  it("фокус піднімається на висоту плато", () => {
    const pose = cameraPose(KYIV, 0.004);
    expect(pose.target.length()).toBeCloseTo(GLOBE_RADIUS * 1.004);
  });
});

describe("fitDistance", () => {
  it("вміщає задану ширину в горизонтальний кут огляду", () => {
    const aspect = 16 / 10;
    const distance = fitDistance(1500, aspect, 50);
    const halfHorizontal = Math.atan(Math.tan((25 * Math.PI) / 180) * aspect);
    expect(distance * Math.tan(halfHorizontal) * 2 * KM_PER_UNIT).toBeCloseTo(1500);
  });

  it("на вузькому екрані відводить камеру далі", () => {
    expect(fitDistance(1500, 0.46, 50)).toBeGreaterThan(fitDistance(1500, 1.6, 50));
  });
});

describe("zoomToDistance", () => {
  it("0 дає далеку відстань, 1 близьку, між ними монотонно", () => {
    expect(zoomToDistance(0, 20, 4)).toBeCloseTo(20);
    expect(zoomToDistance(1, 20, 4)).toBeCloseTo(4);
    expect(zoomToDistance(0.5, 20, 4)).toBeLessThan(20);
    expect(zoomToDistance(0.5, 20, 4)).toBeGreaterThan(4);
  });

  it("не виходить за межі", () => {
    expect(zoomToDistance(-1, 20, 4)).toBeCloseTo(20);
    expect(zoomToDistance(2, 20, 4)).toBeCloseTo(4);
  });

  it("однаковий крок наближає в однакову кількість разів", () => {
    const ratio1 = zoomToDistance(0, 20, 4) / zoomToDistance(0.25, 20, 4);
    const ratio2 = zoomToDistance(0.5, 20, 4) / zoomToDistance(0.75, 20, 4);
    expect(ratio1).toBeCloseTo(ratio2);
  });
});

describe("panView", () => {
  it("карта їде за пальцем", () => {
    const down = panView(KYIV, 0, 100, 900, 50);
    expect(down.lat).toBeGreaterThan(KYIV.lat);
    const right = panView(KYIV, 100, 0, 900, 50);
    expect(right.lng).toBeLessThan(KYIV.lng);
  });

  it("не випускає фокус за межі України", () => {
    const far = panView(KYIV, -1e6, 1e6, 900, 50);
    expect(far.lat).toBe(UKRAINE_BOUNDS.latMax);
    expect(far.lng).toBe(UKRAINE_BOUNDS.lngMax);
  });
});

describe("plateauAltitude", () => {
  it("повна висота здалеку, нижча зблизька, але не нижче порогу", () => {
    expect(plateauAltitude(40, 0.004, 17)).toBe(0.004);
    expect(plateauAltitude(8.5, 0.004, 17)).toBeCloseTo(0.002);
    expect(plateauAltitude(0.1, 0.004, 17)).toBeCloseTo(0.0008);
  });
});
