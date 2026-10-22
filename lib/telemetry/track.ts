"use client";

// lib/telemetry/track.ts
//
// Клієнтський `track` зі словника подій застосунку: так назву не
// переплутати й не вигадати нову повз `EVENTS`.

import { track as kitTrack, type EventProps } from "@/kit/telemetry/client";
import type { EventName } from "./events";

export { EVENTS } from "./events";
export const track = (name: EventName, props?: EventProps): void => kitTrack(name, props);
