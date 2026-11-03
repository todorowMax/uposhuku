// lib/server/placement-paid.ts
//
// Що робимо, коли оплата розміщення щойно зарахована: подія аналітики й сигнал карті
// перемалювати маркери. Спільне для вебхука й звірки статусу.

import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";
import { getPlacement } from "./placement-repo";
import { pushGlobal } from "./realtime";

export const announcePlacementPaid = async (userId: string, amount: number, path: string): Promise<void> => {
  const placement = await getPlacement(userId);
  serverEvent(EVENTS.placementPaid, { tier: placement.tier, amount }, userId, path);
  pushGlobal({ t: "map" });
};
