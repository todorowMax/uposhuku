// lib/telemetry/reports.ts
//
// Звіти, що знають про події Findlyfy: воронки по кроках зі словника.
// Загальні (помилки, події, люди за днями) лежать у kit/telemetry.

import { funnelSql } from "@/kit/telemetry/core";
import { EVENTS } from "./events";

/** Замовник: від першого погляду на карту до угоди. Порядок кроків — порядок воронки. */
export const CUSTOMER_FUNNEL = [
  "page_view",
  EVENTS.mapReady,
  EVENTS.composerFocused,
  EVENTS.composerTagsDetected,
  EVENTS.requestSubmitClicked,
  EVENTS.authStarted,
  EVENTS.requestPublished,
  EVENTS.offerReceived,
  EVENTS.chatOpened,
  EVENTS.dealCreated,
  EVENTS.dealPaid,
  EVENTS.reviewLeft,
];

/** Виконавець: від «Я виконавець» до оплати розміщення. */
export const PERFORMER_FUNNEL = [
  EVENTS.performerCtaClicked,
  EVENTS.authStarted,
  EVENTS.authCompleted,
  EVENTS.profileEditorOpened,
  EVENTS.profileSaved,
  EVENTS.profilePublished,
  EVENTS.placementOpened,
  EVENTS.placementTierSelected,
  EVENTS.placementPaid,
  EVENTS.feedOpened,
  EVENTS.responseSent,
];

export const customerFunnelSql = (days = 30, now = Date.now()) => funnelSql(CUSTOMER_FUNNEL, days, now);
export const performerFunnelSql = (days = 30, now = Date.now()) => funnelSql(PERFORMER_FUNNEL, days, now);
