// lib/tags/engine.ts
//
// Усе, що потрібно полю запиту: знайти теги в тексті, запропонувати
// супутників, показати назви. Клієнт імпортує модуль разом із полем запиту,
// щоб HMR не залишав посилання на застарілий окремий чанк словника.

import { TAGS_BY_ID } from "./dictionary";

export { detectTagMentions, type TagMention } from "./detect";
export { suggestTags, type TagSuggestion } from "./suggest";

export const tagLabel = (id: string): string => TAGS_BY_ID.get(id)?.label ?? id;
export { matchProfiles } from "./match";
