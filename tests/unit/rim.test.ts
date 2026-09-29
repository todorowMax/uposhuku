import { describe, expect, it } from "vitest";
import { ukraineRim } from "@/lib/maplibre/rim";

describe("кромка плато", () => {
  const rim = ukraineRim(3);

  it("складається лише з трикутників", () => {
    for (const [ring] of rim.geometry.coordinates) expect(ring).toHaveLength(4);
  });

  // Довгі тонкі «скалки» через пів країни — те, що ламало кромку раніше.
  it("кожен шматок лишається біля кордону", () => {
    for (const [ring] of rim.geometry.coordinates) {
      const lngs = ring.map((point) => point[0]);
      const lats = ring.map((point) => point[1]);
      expect(Math.max(...lngs) - Math.min(...lngs)).toBeLessThan(1);
      expect(Math.max(...lats) - Math.min(...lats)).toBeLessThan(1);
    }
  });
});
