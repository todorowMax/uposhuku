// lib/performers/server.ts
//
// Публічний виконавець за id на сервері, для сторінки /p/[id]: демо-виконавці
// з lib/map/demo і опубліковані профілі акаунтів (id виду me-<userId>).
// Коли з'явиться D1, змінюється лише ця функція.

import { DEMO_PERFORMERS } from "@/lib/map/demo";
import type { Performer } from "@/lib/map/types";
import { getPlacement } from "@/lib/server/placement-repo";
import { getProfile } from "@/lib/server/profile-repo";
import { profileToPerformer } from "@/lib/profile/to-performer";

export const getPublicPerformer = async (id: string): Promise<Performer | null> => {
  if (id.startsWith("me-")) {
    const userId = id.slice(3);
    const profile = userId ? await getProfile(userId) : null;
    if (!profile?.published) return null;
    const performer = profileToPerformer(profile, userId, 0, (await getPlacement(userId)).tier);
    // «mine» відомо лише клієнту, який знає, хто увійшов.
    return performer ? { ...performer, mine: false } : null;
  }
  return DEMO_PERFORMERS.find((performer) => performer.id === id) ?? null;
};
