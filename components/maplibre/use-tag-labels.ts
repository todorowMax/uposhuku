"use client";

// components/maplibre/use-tag-labels.ts
//
// Підписи тегів: у профілі лежать id, назви дає словник, який вантажиться окремим шматком
// (lib/tags/engine.ts). Поки він не доїхав, показуємо id.

import { useEffect, useState } from "react";

export const useTagLabels = (ids: readonly string[]) => {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const key = ids.join("|");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void import("@/lib/tags/engine").then((engine) => {
      if (!cancelled) setLabels(Object.fromEntries(key.split("|").map((id) => [id, engine.tagLabel(id)])));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return (id: string) => labels[id] ?? id;
};
