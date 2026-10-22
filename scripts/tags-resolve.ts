// scripts/tags-resolve.ts
//
// Закриває пропозицію тегу після того, як тег додано в словник (lib/tags/groups/*)
// і задеплоєно: ставить статус і додає тег усім, хто його просив (профіль, роботи).
//
//   npm run tags:resolve -- --env development --phrase "webflow cms" --tag webflow
//   npm run tags:resolve -- --env production --phrase "вебфлоу" --tag webflow --synonym
//   npm run tags:resolve -- --env production --phrase "щось дивне" --reject --note "не про розробку"
//   --local працює з локальною базою.
//
// ВАЖЛИВО: запускайте ПІСЛЯ деплою словника. Інакше при наступному збереженні
// профілю сервер відкине тег, якого ще немає в задеплоєному словнику.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { phraseKey } from "../lib/tags/detect";
import { TAGS_BY_ID } from "../lib/tags/dictionary";
import { resolveSql, type ProposalUse } from "../lib/telemetry/tags-resolve";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const env = flag("env") ?? "development";
const local = args.includes("--local");
const phrase = flag("phrase");
const tagId = flag("tag");
const reject = args.includes("--reject");
const note = flag("note");

if (!phrase || (!tagId && !reject)) {
  console.error("Потрібно: --phrase \"…\" і --tag <id> (або --reject). Прапорці: --env development|production, --local, --synonym, --note \"…\"");
  process.exit(1);
}
if (tagId && !TAGS_BY_ID.has(tagId)) {
  console.error(`Тегу «${tagId}» немає в словнику цього коду. Додайте його в lib/tags/groups/*, задеплойте й повторіть.`);
  process.exit(1);
}

const wrangler = (extra: string[]) =>
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--env", env, local ? "--local" : "--remote", ...extra], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const query = <T>(sql: string): T[] => {
  const raw = wrangler(["--json", "--command", sql]);
  return (JSON.parse(raw.slice(raw.indexOf("["))) as { results: T[] }[])[0]?.results ?? [];
};

const key = phraseKey(phrase);
const [proposal] = query<{ id: string; text: string; status: string }>(`select id, text, status from tag_proposals where phrase_key = '${key.replace(/'/g, "''")}'`);
if (!proposal) {
  console.error(`Пропозиції «${phrase}» (ключ «${key}») у базі немає.`);
  process.exit(1);
}
const uses = query<ProposalUse>(`select user_id, context, entity_id from tag_proposal_uses where proposal_id = '${proposal.id}'`);

const statements = resolveSql({
  proposalId: proposal.id,
  uses,
  tagId,
  status: reject ? "rejected" : args.includes("--synonym") ? "mapped" : "added",
  note,
});

const dir = resolve(__dirname, "../.cache");
mkdirSync(dir, { recursive: true });
const file = resolve(dir, "tags-resolve.sql");
writeFileSync(file, `${statements.join("\n")}\n`);
wrangler(["--file", file]);
console.log(`Закрито «${proposal.text}» (${uses.length} голосів): ${reject ? "відхилено" : `тег ${tagId} додано профілям і роботам`}.`);
