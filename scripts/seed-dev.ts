// scripts/seed-dev.ts
//
// Наповнює dev-базу демо-даними, щоб карта не була порожньою: ~70 виконавців
// (профілі, теги, роботи, оплати розміщення, відгуки), кілька замовників із
// запитами й відгуками на них. Усе позначено id `demo-…` (виконавець на карті —
// `me-demo-…`), тому сід можна запускати повторно: він спершу видаляє попередні
// демо-рядки. Живі акаунти не чіпає. На прод не запускати.
//
// Скрипт лише складає SQL у .cache/seed.sql, а накочує його wrangler:
//   npm run db:seed:local          локальна D1
//   npm run db:seed:development    dev-воркер (remote)
//   з прапорцем --clean лише прибирає демо-рядки, нічого не додаючи:
//   npm run db:unseed:local, npm run db:unseed:development

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEMO_PERFORMERS, WORKS_BY_TAG } from "../lib/map/demo";
import { TEMPLATES } from "../lib/feed/seed-requests";
import { DEADLINES } from "../lib/requests/types";
import { TIER_FLOOR, type PaidTier } from "../lib/placement/pricing";
import { TAGS_BY_ID } from "../lib/tags/dictionary";

const NOW = Date.now();
const MIN = 60_000;
const DAY = 86_400_000;

const q = (value: string | number | null | boolean): string => {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
};

const hash = (value: string): number => {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 2 ** 32;
};

/** Багаторядкові INSERT, порціями до ~50 КБ: у D1 є ліміт на довжину одного оператора. */
const inserts = (table: string, columns: string[], rows: (string | number | null | boolean)[][]): string[] => {
  const statements: string[] = [];
  let chunk: string[] = [];
  let size = 0;
  const flush = () => {
    if (chunk.length) statements.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES\n${chunk.join(",\n")};`);
    chunk = [];
    size = 0;
  };
  for (const row of rows) {
    const text = `(${row.map(q).join(", ")})`;
    if (size + text.length > 50_000) flush();
    chunk.push(text);
    size += text.length;
  }
  flush();
  return statements;
};

const out: string[] = [];
const emit = (...lines: string[]) => out.push(...lines);

// ───────────── очищення попереднього сіда ─────────────
const demoUsers = "(SELECT id FROM users WHERE id LIKE 'demo-%')";
emit(
  `DELETE FROM reviews WHERE author_user_id IN ${demoUsers};`,
  `DELETE FROM responses WHERE performer_user_id IN ${demoUsers} OR request_id IN (SELECT id FROM requests WHERE user_id IN ${demoUsers});`,
  `DELETE FROM request_tags WHERE request_id IN (SELECT id FROM requests WHERE user_id IN ${demoUsers});`,
  `DELETE FROM request_files WHERE request_id IN (SELECT id FROM requests WHERE user_id IN ${demoUsers});`,
  `DELETE FROM requests WHERE user_id IN ${demoUsers};`,
  `DELETE FROM payments WHERE user_id IN ${demoUsers};`,
  `DELETE FROM project_tags WHERE project_id IN (SELECT id FROM projects WHERE user_id IN ${demoUsers});`,
  `DELETE FROM projects WHERE user_id IN ${demoUsers};`,
  `DELETE FROM profile_tags WHERE user_id IN ${demoUsers};`,
  `DELETE FROM profiles WHERE user_id IN ${demoUsers};`,
  `DELETE FROM users WHERE id LIKE 'demo-%';`,
);

if (process.argv.includes("--clean")) {
  const dir = resolve(__dirname, "../.cache");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "seed.sql"), `${out.join("\n")}\n`);
  console.log("Демо-рядки (id demo-…) буде видалено, нічого не додаємо → .cache/seed.sql");
  process.exit(0);
}

// ───────────── користувачі ─────────────
const userRows: (string | number | null)[][] = [];
const addUser = (id: string, name: string) => userRows.push([id, `${id}@seed.invalid`, NOW - 30 * DAY, name, NOW - 30 * DAY, NOW - 30 * DAY]);

const performers = DEMO_PERFORMERS.map((person) => ({ person, userId: `demo-${person.id}` }));
for (const { person, userId } of performers) addUser(userId, person.name);
addUser("demo-reviewer", "Демо-замовник");
TEMPLATES.forEach((_, index) => addUser(`demo-customer-${index}`, "Замовник"));
emit(...inserts("users", ["id", "email", "email_verified_at", "display_name", "created_at", "last_login_at"], userRows));

// ───────────── профілі, теги, роботи ─────────────
const profileRows: (string | number | null | boolean)[][] = [];
const tagRows: string[][] = [];
const projectRows: (string | number)[][] = [];
const projectTagRows: string[][] = [];

/** Із якого тегу взято назву роботи: щоб робота підтверджувала саме його. */
const sourceTag = (tags: string[], title: string) => tags.find((tag) => WORKS_BY_TAG[tag]?.some(([name]) => name === title));

for (const { person, userId } of performers) {
  const face = String(person.avatarIndex % 16).padStart(2, "0");
  profileRows.push([userId, person.name, person.cityId, person.lat, person.lng, person.specialty, person.bio, `/map/faces/face-${face}.jpg`, true, NOW - 3 * DAY]);
  for (const tag of person.tags) tagRows.push([userId, tag]);
  person.works.forEach((work, position) => {
    const id = `${userId}:${person.id}-work-${position}`;
    projectRows.push([id, userId, position, work.title, work.title, ""]);
    const tag = sourceTag(person.tags, work.title);
    if (tag) projectTagRows.push([id, tag]);
  });
}
emit(
  ...inserts("profiles", ["user_id", "name", "city_id", "lat", "lng", "specialty", "bio", "photo", "published", "updated_at"], profileRows),
  ...inserts("profile_tags", ["user_id", "tag_id"], tagRows),
  ...inserts("projects", ["id", "user_id", "position", "title", "description", "url"], projectRows),
  ...inserts("project_tags", ["project_id", "tag_id"], projectTagRows),
);

// ───────────── оплати розміщення: з них рахується рівень ─────────────
/** Ширина діапазону сум, з якого береться оплата рівня. */
const SPAN: Record<PaidTier, number> = { 2: 350, 3: 700, 4: 1200, 5: 2200, 6: 5000 };
const paymentRows: (string | number)[][] = [];
for (const { person, userId } of performers) {
  if (person.tier < 2) continue;
  const tier = person.tier as PaidTier;
  paymentRows.push([`pay_seed_${person.id}`, userId, TIER_FLOOR[tier] + Math.floor(hash(person.id) * SPAN[tier]), tier, NOW - 2 * DAY]);
}
emit(...inserts("payments", ["id", "user_id", "amount", "tier_after", "created_at"], paymentRows));

// ───────────── відгуки про роботу ─────────────
const REVIEW_TEXTS = [
  "Зробила швидко й охайно, усе пояснювала по ходу. Рекомендую.",
  "Домовились чітко, терміни дотримано. Були правки, внесла без проблем.",
  "Хороша комунікація, результат навіть кращий, ніж очікував.",
  "Добре розуміє бізнес-задачу, а не просто виконує ТЗ.",
  "Трохи затримали першу версію, але фінал якісний.",
];
const REVIEW_AUTHORS = ["Олексій", "Марина", "Андрій", "Наталія", "Денис", "Ірина"];
const reviewRows: (string | number)[][] = [];
for (const { person, userId } of performers) {
  const count = 2 + (Math.floor(hash(`${person.id}:n`) * 1000) % 3);
  for (let index = 0; index < count; index++) {
    const seed = Math.floor(hash(`${person.id}:${index}`) * 2 ** 32);
    reviewRows.push([`rev_seed_${person.id}_${index}`, `me-${userId}`, `seed-${person.id}-${index}`, "demo-reviewer", seed % 5 === 0 ? 4 : 5, REVIEW_TEXTS[seed % REVIEW_TEXTS.length], REVIEW_AUTHORS[(seed >>> 3) % REVIEW_AUTHORS.length], NOW - (10 + index * 9) * DAY]);
  }
}
emit(...inserts("reviews", ["id", "performer_id", "deal_id", "author_user_id", "stars", "text", "author", "created_at"], reviewRows));

// ───────────── запити замовників і відгуки на них ─────────────
/** «до 15 000 ₴», «20 000–40 000 ₴», «від 50 000 ₴» → верхня межа числом. */
const budgetOf = (value: string | null): number | null => {
  if (!value) return null;
  const numbers = [...value.replace(/\s/g, "").matchAll(/\d+/g)].map((match) => Number(match[0]));
  return numbers.length ? Math.max(...numbers) : null;
};

const requestRows: (string | number | null)[][] = [];
const requestTagRows: string[][] = [];
const responseRows: (string | number | null)[][] = [];
const overlap = (a: string[], b: string[]) => a.filter((tag) => b.includes(tag)).length;

TEMPLATES.forEach((template, index) => {
  const id = `req_seed_${index}`;
  const createdAt = NOW - (index + 1) * 47 * MIN;
  requestRows.push([id, `demo-customer-${index}`, template.text, budgetOf(template.budget), template.deadline && template.deadline in DEADLINES ? template.deadline : null, template.cityId, "open", createdAt]);
  for (const tag of template.tags) requestTagRows.push([id, tag, TAGS_BY_ID.get(tag)?.label ?? tag]);
  const candidates = [...performers]
    .sort((a, b) => overlap(b.person.tags, template.tags) - overlap(a.person.tags, template.tags) || hash(`${id}:${a.person.id}`) - hash(`${id}:${b.person.id}`))
    .slice(0, template.responses);
  candidates.forEach(({ person, userId }, order) => {
    const price = Math.round((4000 + hash(`${id}:${person.id}:price`) * 30_000) / 500) * 500;
    responseRows.push([`resp_seed_${index}_${order}`, id, userId, price, 3 + Math.floor(hash(`${id}:${person.id}:days`) * 20), "Добрий день! Запит зрозумілий, можу взятися. Покажу схожі роботи в чаті й уточню деталі.", createdAt + (order + 1) * 11 * MIN]);
  });
});
emit(
  ...inserts("requests", ["id", "user_id", "text", "budget", "deadline", "city_id", "status", "created_at"], requestRows),
  ...inserts("request_tags", ["request_id", "tag_id", "label"], requestTagRows),
  ...inserts("responses", ["id", "request_id", "performer_user_id", "price", "days", "message", "created_at"], responseRows),
);

const dir = resolve(__dirname, "../.cache");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "seed.sql"), `${out.join("\n")}\n`);
console.log(`Сід: ${performers.length} виконавців, ${TEMPLATES.length} запитів, ${responseRows.length} відгуків, ${reviewRows.length} відгуків про роботу → .cache/seed.sql`);
