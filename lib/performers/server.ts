// lib/performers/server.ts
//
// Публічний виконавець за id на сервері, для сторінки /p/[id]: опублікований
// профіль з D1 (id виду me-<userId>).

import type { Performer } from "@/lib/map/types";
import { getPlacement } from "@/lib/server/placement-repo";
import { getProfile } from "@/lib/server/profile-repo";
import { performerStatsOf } from "@/lib/server/stats-repo";
import { profileToPerformer } from "@/lib/profile/to-performer";

export const getPublicPerformer = async (id: string): Promise<Performer | null> => {
  if (!id.startsWith("me-")) return null;
  const userId = id.slice(3);
  const profile = userId ? await getProfile(userId) : null;
  if (!profile?.published) return null;
  const performer = profileToPerformer(profile, userId, 0, (await getPlacement(userId)).tier);
  // «mine» відомо лише клієнту, який знає, хто увійшов.
  return performer ? { ...performer, mine: false, stats: await performerStatsOf(userId) } : null;
};
