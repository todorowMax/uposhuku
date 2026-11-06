"use client";

import { useEffect } from "react";
import { onRealtime } from "@/lib/realtime/client";
import { loadRealPerformers } from "./performers";
import { createRefreshGate } from "./refresh-gate";

const POLL_MS = 30_000;

/**
 * Підтягує справжніх виконавців на карту: при відкритті, раз на пів хвилини (разом з
 * точкою «онлайн»), при поверненні на вкладку, а за подією «map» із випадковою
 * затримкою до 3 с і склейкою. Подія «presence» перечитування не викликає.
 */
export function RealPerformersSync() {
  useEffect(() => {
    const load = () => {
      if (!document.hidden) void loadRealPerformers();
    };
    void loadRealPerformers();
    const gate = createRefreshGate(load);
    const timer = window.setInterval(load, POLL_MS);
    const off = onRealtime((event) => {
      if (event.t === "map") gate.request();
    });
    document.addEventListener("visibilitychange", load);
    return () => {
      window.clearInterval(timer);
      gate.cancel();
      off();
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return null;
}
