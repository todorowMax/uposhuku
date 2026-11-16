import { describe, expect, it } from "vitest";
import { activeSlide } from "@/lib/maplibre/carousel";

describe("активна картка каруселі групи", () => {
  it("за прокруткою: найближча до кроку картка", () => {
    expect(activeSlide({ scrollLeft: 0, step: 300, count: 5 })).toBe(0);
    expect(activeSlide({ scrollLeft: 140, step: 300, count: 5 })).toBe(0);
    expect(activeSlide({ scrollLeft: 160, step: 300, count: 5 })).toBe(1);
    expect(activeSlide({ scrollLeft: 900, step: 300, count: 5 })).toBe(3);
  });

  it("не виходить за межі списку й не ділить на нуль", () => {
    expect(activeSlide({ scrollLeft: 5000, step: 300, count: 5 })).toBe(4);
    expect(activeSlide({ scrollLeft: -40, step: 300, count: 5 })).toBe(0);
    expect(activeSlide({ scrollLeft: 300, step: 0, count: 5 })).toBe(0);
    expect(activeSlide({ scrollLeft: 300, step: 300, count: 0 })).toBe(0);
  });
});
