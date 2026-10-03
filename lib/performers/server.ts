// lib/performers/server.ts
//
// Публічний виконавець за id на сервері, для сторінки /p/[id]: демо-виконавці
// з lib/map/demo і опубліковані профілі акаунтів (id виду me-<userId>).
// Коли з'явиться D1, змінюється лише ця функція.

import { DEMO_PERFORMERS } from "@/lib/map/demo";
import type { Performer } from "@/lib/map/types";
import { getPlacement } from "@/lib/placement/mock-store";
import { getProfile } from "@/lib/profile/mock-store";
import { profileToPerformer } from "@/lib/profile/to-performer";

export const getPublicPerformer = (id: string): Performer | null => {
  if (id.startsWith("me-")) {
    const userId = id.slice(3);
    const profile = userId ? getProfile(userId) : null;
    if (!profile?.published) return null;
    const performer = profileToPerformer(profile, userId, 0, getPlacement(userId).tier);
    // «mine» відомо лише клієнту, який знає, хто увійшов.
    return performer ? { ...performer, mine: false } : null;
  }
  return DEMO_PERFORMERS.find((performer) => performer.id === id) ?? null;
};
