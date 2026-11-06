import { describe, expect, it, vi } from "vitest";
import { createRefreshGate } from "@/lib/map/refresh-gate";
import { getPerformers, setMyPerformer, setRealPerformers } from "@/lib/map/performers";
import { beatAllowed } from "@/lib/server/presence-sql";
import type { Performer } from "@/lib/map/types";

const fakeTimers = () => {
  let next = 1;
  const jobs = new Map<number, { run: () => void; ms: number }>();
  return {
    jobs,
    timers: {
      set: (run: () => void, ms: number) => {
        jobs.set(next, { run, ms });
        return next++;
      },
      clear: (id: number) => void jobs.delete(id),
    },
  };
};

describe("склейка подій map", () => {
  it("кілька подій підряд дають одне перечитування з затримкою до 3 с", () => {
    const { jobs, timers } = fakeTimers();
    const run = vi.fn();
    const gate = createRefreshGate(run, { spread: 3000, random: () => 0.5, timers });
    gate.request();
    gate.request();
    gate.request();
    expect(jobs.size).toBe(1);
    expect([...jobs.values()][0].ms).toBe(1500);
    [...jobs.values()][0].run();
    expect(run).toHaveBeenCalledTimes(1);
    gate.request();
    expect(jobs.size).toBe(2);
  });

  it("затримка ніколи не досягає ліміту", () => {
    const { jobs, timers } = fakeTimers();
    createRefreshGate(vi.fn(), { spread: 3000, random: () => 0.999999, timers }).request();
    expect([...jobs.values()][0].ms).toBeLessThan(3000);
  });

  it("cancel скасовує заплановане", () => {
    const { jobs, timers } = fakeTimers();
    const gate = createRefreshGate(vi.fn(), { spread: 3000, random: () => 0.1, timers });
    gate.request();
    gate.cancel();
    expect(jobs.size).toBe(0);
  });
});

describe("пульс присутності", () => {
  it("не частіше разу на 20 с з сокета", () => {
    expect(beatAllowed(undefined, 1000)).toBe(true);
    expect(beatAllowed(1000, 1000 + 19_999)).toBe(false);
    expect(beatAllowed(1000, 1000 + 20_000)).toBe(true);
  });
});

const person = (id: string): Performer => ({ id, name: id, specialty: "x", stats: { months: 1, orders: 0, rating: null, reviews: 0 } }) as unknown as Performer;

describe("моя картка при кеші карти", () => {
  it("щойно опублікований профіль видно, хоч кеш його ще не має", () => {
    setRealPerformers([person("me-other")]);
    setMyPerformer(person("me-self"));
    expect(getPerformers().map((p) => p.id).sort()).toEqual(["me-other", "me-self"]);
  });

  it("знятий з публікації не показується з застарілого кешу, а повертається після нової публікації", () => {
    setRealPerformers([person("me-other"), person("me-self")]);
    setMyPerformer(person("me-self"));
    setMyPerformer(null);
    expect(getPerformers().map((p) => p.id)).toEqual(["me-other"]);
    setRealPerformers([person("me-other"), person("me-self")]);
    expect(getPerformers().map((p) => p.id)).toEqual(["me-other"]);
    setMyPerformer(person("me-self"));
    expect(getPerformers().map((p) => p.id).sort()).toEqual(["me-other", "me-self"]);
  });
});
