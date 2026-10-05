"use client";

import { useEffect } from "react";
import { startPolling } from "@/lib/realtime/client";
import { loadRealPerformers } from "./performers";

const POLL_MS = 30_000;

/** Підтягує справжніх виконавців на карту: при відкритті, за подією «map», а запасом раз на пів хвилини. */
export function RealPerformersSync() {
  useEffect(() => {
    void loadRealPerformers();
    const stop = startPolling(() => !document.hidden && void loadRealPerformers(), POLL_MS, ["map", "presence"]);
    const onVisible = () => {
      if (!document.hidden) void loadRealPerformers();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
