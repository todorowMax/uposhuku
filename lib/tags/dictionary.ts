// lib/tags/dictionary.ts
//
// Перша версія словника: зібрана вручну, щоб покрити якомога більше
// типових запитів. Далі росте зі статистики: слова з запитів, які не
// знайшлися в словнику, пишемо в лог і раз на тиждень додаємо сюди.

import { FEATURE_TAGS } from "./groups/feature";
import { INDUSTRY_TAGS } from "./groups/industry";
import { INTEGRATION_TAGS } from "./groups/integration";
import { PRODUCT_TAGS } from "./groups/product";
import { SERVICE_TAGS } from "./groups/service";
import { TOOL_TAGS } from "./groups/tool";
import type { TagDef, TagGroup } from "./types";

export const TAGS: TagDef[] = [
  ...PRODUCT_TAGS,
  ...FEATURE_TAGS,
  ...INDUSTRY_TAGS,
  ...INTEGRATION_TAGS,
  ...TOOL_TAGS,
  ...SERVICE_TAGS,
];

export const TAG_GROUPS: { id: TagGroup; label: string }[] = [
  { id: "product", label: "Тип продукту" },
  { id: "feature", label: "Функції" },
  { id: "industry", label: "Галузь" },
  { id: "integration", label: "Інтеграції" },
  { id: "tool", label: "Інструменти" },
  { id: "service", label: "Послуги" },
];

export const TAGS_BY_ID = new Map(TAGS.map((tag) => [tag.id, tag]));
