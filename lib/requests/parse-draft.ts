// lib/requests/parse-draft.ts
//
// Перевірка чернетки запиту, що приходить від клієнта: спільна для публікації (POST) і правки (PATCH).

import { CITIES } from "@/lib/map/cities";
import { resolveDeadlineDate } from "@/lib/requests/deadline-date";
import { withTags } from "@/lib/requests/derive-tags";
import { REQUEST_TEXT_MAX, REQUEST_TEXT_MIN, isDeadline, type Deadline, type RequestDraft } from "@/lib/requests/types";

const MAX_TAGS = 30;
const MAX_FILES = 10;

export interface ParseDraftOptions {
  /** «Зараз»: від нього рахується, чи дата терміну не минула й не задалека. */
  now: Date;
  /** Дата терміну, що вже збережена в запиті (правка): така сама дата проходить, навіть якщо вже минула. */
  keepDate?: string | null;
}

/** Своя дата терміну: порожнє означає «не вказано»; повернутий рядок — причина відмови. */
const parseDeadline = (body: Record<string, unknown> | null, { now, keepDate }: ParseDraftOptions): { deadline: Deadline | null; deadlineDate: string | null } | string => {
  const sent = body?.deadlineDate;
  if (sent === undefined || sent === null || sent === "") return { deadline: isDeadline(body?.deadline) ? body.deadline : null, deadlineDate: null };
  // Збережену раніше дату не перевіряємо заново: вона вже пройшла перевірку, а строк міг спливти; готовий строк лишає репозиторій.
  if (typeof sent === "string" && sent === keepDate) return { deadline: isDeadline(body?.deadline) ? body.deadline : null, deadlineDate: sent };
  const resolved = resolveDeadlineDate(sent, now);
  return resolved.ok ? { deadline: resolved.deadline, deadlineDate: resolved.date } : resolved.reason;
};

/** Лише очікувані поля й розумні межі: тіло приходить від клієнта як є. Рядок у відповіді — причина відмови. */
export const parseDraft = (body: Record<string, unknown> | null, options: ParseDraftOptions): RequestDraft | string => {
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < REQUEST_TEXT_MIN) return "Опишіть, що потрібно зробити.";
  if (text.length > REQUEST_TEXT_MAX) return `Опис задовгий: до ${REQUEST_TEXT_MAX} символів.`;
  const sentTags = Array.isArray(body?.tags) ? body.tags : [];
  const files = Array.isArray(body?.files) ? body.files : [];
  const budget = typeof body?.budget === "number" && Number.isFinite(body.budget) && body.budget >= 100 && body.budget <= 10_000_000 ? Math.round(body.budget) : null;
  const deadline = parseDeadline(body, options);
  if (typeof deadline === "string") return deadline;
  const cityId = typeof body?.cityId === "string" && CITIES.some((city) => city.id === body.cityId) ? body.cityId : null;
  return {
    text,
    budget,
    ...deadline,
    cityId,
    // Типово показуємо; людина може вимкнути галочкою у формі.
    channelOptIn: body?.channelOptIn !== false,
    tags: withTags(
      text,
      sentTags
        .filter((tag): tag is { id: string; label: string } => typeof tag?.id === "string" && typeof tag?.label === "string")
        .slice(0, MAX_TAGS)
        .map(({ id, label }) => ({ id: id.slice(0, 64), label: label.slice(0, 80) })),
    ),
    files: files
      .filter((file): file is { name: string; size: number; type: string } => typeof file?.name === "string" && typeof file?.size === "number")
      .slice(0, MAX_FILES)
      .map(({ name, size, type }) => ({ name: name.slice(0, 200), size, type: typeof type === "string" ? type.slice(0, 100) : "" })),
  };
};
