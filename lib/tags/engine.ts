// lib/tags/engine.ts
//
// Усе, що потрібно полю запиту: знайти теги в тексті, запропонувати
// супутників, показати назви. Окремий модуль, щоб клієнт вантажив словник
// (~8 тис. фраз) динамічним import() лише тоді, коли людина почала писати,
// а не з першим екраном.

import { TAGS_BY_ID } from "./dictionary";

export { detectTagMentions, type TagMention } from "./detect";
export { suggestTags, type TagSuggestion } from "./suggest";

export const tagLabel = (id: string): string => TAGS_BY_ID.get(id)?.label ?? id;
export { matchProfiles } from "./match";
