// lib/telemetry/salt.ts
//
// Сіль для хешів IP: та сама в телеметрії й у записах згод, щоб один IP мав один хеш і сирий IP ніде не лежав.

import { readVar } from "@/lib/server/env";

export const telemetrySalt = (): string => readVar("AUTH_SECRET") ?? "uposhuku-dev-salt";
