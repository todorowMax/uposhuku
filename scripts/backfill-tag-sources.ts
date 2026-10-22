// scripts/backfill-tag-sources.ts
//
// Одноразовий перенос після міграції 0003 (колонка `source` у profile_tags і
// project_tags). Усі наявні теги отримали `auto`, але частина з них додана
// людиною сірою «+» і в тексті її немає: без переносу вони зникли б при
// найближчому збереженні профілю, бо сервер тепер рахує теги з тексту.
//
// Скрипт читає профілі й роботи з бази, розпізнає теги в їхніх текстах так
// само, як сервер, і тегам, яких у тексті нема, ставить `manual`. Нічого не
// видаляє, повторний запуск нічого не змінює.
//   npm run db:backfill-tags:local
//   npm run db:backfill-tags:development
// На прод не потрібен: там порожньо.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectTags } from "../lib/tags/detect";

const remote = process.argv.includes("--remote");
const baseArgs = ["wrangler", "d1", "execute", "DB", "--env", "development", remote ? "--remote" : "--local"];

const query = <T>(sql: string): T[] => {
  const raw = execFileSync("npx", [...baseArgs, "--json", "--command", sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const parsed = JSON.parse(raw.slice(raw.indexOf("["))) as { results: T[] }[];
  return parsed[0]?.results ?? [];
};

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

const profiles = query<{ user_id: string; specialty: string; bio: string }>("select user_id, specialty, bio from profiles");
const profileTags = query<{ user_id: string; tag_id: string }>("select user_id, tag_id from profile_tags where source = 'auto'");
const projects = query<{ id: string; title: string; description: string }>("select id, title, description from projects");
const projectTags = query<{ project_id: string; tag_id: string }>("select project_id, tag_id from project_tags where source = 'auto'");

const statements: string[] = [];

for (const profile of profiles) {
  const detected = new Set(detectTags(`${profile.specialty}\n${profile.bio}`));
  for (const row of profileTags.filter((tag) => tag.user_id === profile.user_id)) {
    if (!detected.has(row.tag_id)) statements.push(`update profile_tags set source = 'manual' where user_id = ${q(profile.user_id)} and tag_id = ${q(row.tag_id)};`);
  }
}
for (const project of projects) {
  const detected = new Set(detectTags(`${project.title}\n${project.description}`));
  for (const row of projectTags.filter((tag) => tag.project_id === project.id)) {
    if (!detected.has(row.tag_id)) statements.push(`update project_tags set source = 'manual' where project_id = ${q(project.id)} and tag_id = ${q(row.tag_id)};`);
  }
}

if (statements.length === 0) {
  console.log("Нема що переносити: усі теги вже збігаються з текстом.");
  process.exit(0);
}

const dir = resolve(__dirname, "../.cache");
mkdirSync(dir, { recursive: true });
const file = resolve(dir, "backfill-tags.sql");
writeFileSync(file, `${statements.join("\n")}\n`);
execFileSync("npx", [...baseArgs, "--file", file], { stdio: "inherit" });
console.log(`Перенесено: ${statements.length} тегів стали ручними (${remote ? "remote" : "local"}).`);
