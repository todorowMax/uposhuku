"use client";

import { useEffect } from "react";
import { loadRealPerformers } from "./performers";

const POLL_MS = 30_000;

/** Підтягує справжніх виконавців на карту: при відкритті, раз на пів хвилини й коли вкладка знову видима. */
export function RealPerformersSync() {
  useEffect(() => {
    void loadRealPerformers();
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadRealPerformers();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void loadRealPerformers();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
