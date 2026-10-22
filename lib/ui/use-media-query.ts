"use client";

import { useEffect, useState } from "react";

/**
 * Збіг медіа-запиту. На сервері й до гідратації `false`: розмітка першого
 * кадру однакова для всіх, а потім підлаштовується під екран.
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
};
