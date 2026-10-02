// lib/map/avatar-style.ts
//
// Фон-аватар для DOM: власне фото профілю, якщо є, інакше комірка атласу
// облич. На полотні карти фото малює lib/map/portrait.ts.

import type { CSSProperties } from "react";
import { AVATAR_ATLAS, AVATAR_COUNT } from "./portrait";
import type { Performer } from "./types";

export const avatarBackground = (performer: Pick<Performer, "photo" | "avatarIndex">, size?: number): CSSProperties => {
  const base = size ? { width: size, height: size } : {};
  if (performer.photo) return { ...base, backgroundImage: `url(${performer.photo})`, backgroundSize: "cover", backgroundPosition: "center" };
  const cell = performer.avatarIndex % AVATAR_COUNT;
  return {
    ...base,
    backgroundImage: `url(${AVATAR_ATLAS})`,
    backgroundSize: "400% 400%",
    backgroundPosition: `${(cell % 4) * 100 / 3}% ${Math.floor(cell / 4) * 100 / 3}%`,
  };
};
