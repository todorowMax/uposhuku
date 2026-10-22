"use client";

// lib/telemetry/tag-events.ts
//
// Події про теги. Це єдине місце, де в аналітику потрапляє щось від людини
// словами: `query` (що шукали й не знайшли) і `phrase` (з якого фрагмента
// розпізнано тег, який вона прибрала). Обидва нормалізовані, до 40 символів
// і без контактів: нам потрібна лише підказка для словника, а не текст.

import { mentionsContacts } from "@/lib/chat/contacts";
import { normalizeTagText } from "@/lib/tags/normalize";
import { EVENTS, track } from "./track";

export type TagContext = "profile" | "work" | "request" | "filter";
export type TagAddSource = "suggestion" | "picker";

const MAX_PHRASE = 40;

/** Текст для підказки словнику: нормалізований, короткий, без телефонів, @ніків, пошти й посилань. */
export const safePhrase = (text: string): string | null => {
  if (mentionsContacts(text) || /@|https?:|www\./i.test(text)) return null;
  const clean = normalizeTagText(text).slice(0, MAX_PHRASE).trim();
  // Лише літери й пробіли: цифри в запиті — найчастіше номер чогось.
  return clean.length >= 2 && !/\d{4,}/.test(clean) ? clean : null;
};

export const trackPickerOpened = (context: TagContext) => track(EVENTS.tagPickerOpened, { context });

export const trackSearchEmpty = (context: TagContext, query: string) => {
  const safe = safePhrase(query);
  if (safe) track(EVENTS.tagSearchEmpty, { context, query: safe });
};

export const trackTagPicked = (context: TagContext, tag: string, rank: number, via: string) => track(EVENTS.tagPicked, { context, tag, rank, via });

export const trackTagAdded = (context: TagContext, tag: string, source: TagAddSource) => track(EVENTS.tagAdded, { context, tag, source });

export const trackTagRemoved = (context: TagContext, tag: string, source: "auto" | "manual", phrase?: string) => {
  const safe = phrase ? safePhrase(phrase) : null;
  track(EVENTS.tagRemoved, { context, tag, source, ...(safe ? { phrase: safe } : {}) });
};
