// lib/telemetry/tags-resolve.ts
//
// Закриття пропозиції тегу після того, як тег додано в словник і
// задеплоєно: ставимо статус і додаємо тег усім, хто його просив.
// Генерує SQL, виконує його scripts/tags-resolve.ts (через wrangler).

export type ProposalUse = { user_id: string; context: "profile" | "work" | "request"; entity_id: string };

export interface ResolveInput {
  proposalId: string;
  uses: ProposalUse[];
  /** Тег словника, що закрив пропозицію. Для відхилення не потрібен. */
  tagId?: string;
  /** Підпис для запиту: тег, що додається до запиту, показує назву. */
  tagLabel?: string;
  /** added: новий тег; mapped: це синонім наявного; rejected: не додаємо. */
  status: "added" | "mapped" | "rejected";
  note?: string;
  now?: number;
}

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * Усі запити однією пачкою. Тег додається як `manual`: людина просила його
 * сама. `insert or ignore` не чіпає того, що вже є (зокрема тег, який вона
 * прибрала з тексту й цим сказала, що він не потрібен).
 */
export const resolveSql = (input: ResolveInput): string[] => {
  const now = input.now ?? Date.now();
  const rejected = input.status === "rejected";
  if (!rejected && !input.tagId) throw new Error("Для закриття потрібен тег словника (--tag)");

  const statements = [
    `update tag_proposals set status = ${q(input.status)}, resolved_tag_id = ${rejected ? "null" : q(input.tagId!)}, note = ${input.note ? q(input.note) : "null"}, updated_at = ${now} where id = ${q(input.proposalId)};`,
  ];
  if (rejected) return statements;

  for (const use of input.uses) {
    if (use.context === "profile") {
      statements.push(`insert or ignore into profile_tags (user_id, tag_id, source) values (${q(use.user_id)}, ${q(input.tagId!)}, 'manual');`);
    } else if (use.context === "work" && use.entity_id) {
      // Id роботи в базі унікальний на всіх: префікс користувача (lib/server/profile-repo.ts).
      statements.push(`insert or ignore into project_tags (project_id, tag_id, source) values (${q(`${use.user_id}:${use.entity_id}`)}, ${q(input.tagId!)}, 'manual');`);
    }
    // Запити (context request) не доповнюємо: пропозиція йшла до публікації, id запиту невідомий. Це лише сигнал для словника.
  }
  return statements;
};
