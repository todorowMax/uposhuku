// tests/helpers/money-mocks.ts
//
// Общие подмены для тестов денег безопасной сделки: сессия, уведомления, письма админам, «банк».
// Отдельный модуль без импортов приложения, чтобы фабрики vi.mock могли брать его лениво.

import { vi } from "vitest";
import { createFakeBank } from "./fake-bank";

export const session = { user: null as { id: string; email: string } | null };
export const notifyLater = vi.fn();
export const adminMail = vi.fn();
export const bank = createFakeBank();
