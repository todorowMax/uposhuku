// lib/server/profile-repo.ts
//
// Профілі виконавців на D1: profiles + profile_tags (заявлені теги) +
// projects + project_tags (підтверджені). Збереження одним батчем, щоб
// профіль не лишився напівзаписаним.

import { asc, eq, inArray } from "drizzle-orm";
import { profileTags, profiles, projectTags, projects } from "@/db/schema";
import { emptyProfile, type Profile, type ProfileWork } from "@/lib/profile/types";
import { getDb, inChunks } from "./db";

const iso = (value: number) => new Date(value).toISOString();

/** Збирає профіль з рядків кількох таблиць. */
type TagRow = { tagId: string; source: "auto" | "manual" | "hidden" };

/** Рядки тегів → підсумок (без прихованих), ручні й приховані. */
const splitTags = (rows: TagRow[]) => ({
  tags: rows.filter((row) => row.source !== "hidden").map((row) => row.tagId),
  manualTags: rows.filter((row) => row.source === "manual").map((row) => row.tagId),
  hiddenTags: rows.filter((row) => row.source === "hidden").map((row) => row.tagId),
});

/** Підсумок + ручні + приховані → рядки з джерелом. */
const tagRows = (tags: string[], manualTags: string[], hiddenTags: string[]): TagRow[] => [
  ...tags.map((tagId): TagRow => ({ tagId, source: manualTags.includes(tagId) ? "manual" : "auto" })),
  ...hiddenTags.filter((tagId) => !tags.includes(tagId)).map((tagId): TagRow => ({ tagId, source: "hidden" })),
];

const assemble = (
  row: typeof profiles.$inferSelect,
  tags: TagRow[],
  works: { project: typeof projects.$inferSelect; tags: TagRow[] }[],
): Profile => ({
  name: row.name,
  cityId: row.cityId,
  location: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
  specialty: row.specialty,
  bio: row.bio,
  ...splitTags(tags),
  works: works.map(({ project, tags: workTags }): ProfileWork => ({ id: project.id.slice(project.userId.length + 1), title: project.title, description: project.description, url: project.url, ...splitTags(workTags) })),
  photo: row.photo,
  published: row.published,
  updatedAt: iso(row.updatedAt),
});

/** Профілі за списком користувачів, у три запити замість N. */
const load = async (rows: (typeof profiles.$inferSelect)[]): Promise<Map<string, Profile>> => {
  const result = new Map<string, Profile>();
  if (rows.length === 0) return result;
  const db = getDb();
  const ids = rows.map((row) => row.userId);
  const [profileTagRows, projectRows] = await Promise.all([
    inChunks(ids, (chunk) => db.select().from(profileTags).where(inArray(profileTags.userId, chunk))),
    inChunks(ids, (chunk) => db.select().from(projects).where(inArray(projects.userId, chunk)).orderBy(asc(projects.position))),
  ]);
  const workTagRows = await inChunks(
    projectRows.map((project) => project.id),
    (chunk) => db.select().from(projectTags).where(inArray(projectTags.projectId, chunk)),
  );
  for (const row of rows) {
    result.set(
      row.userId,
      assemble(
        row,
        profileTagRows.filter((tag) => tag.userId === row.userId),
        projectRows
          .filter((project) => project.userId === row.userId)
          .map((project) => ({ project, tags: workTagRows.filter((tag) => tag.projectId === project.id) })),
      ),
    );
  }
  return result;
};

export const getProfile = async (userId: string): Promise<Profile | null> => {
  const [row] = await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!row) return null;
  return (await load([row])).get(userId) ?? null;
};

/** Усі опубліковані профілі: карта, підбір, стрічка. */
export const listPublishedProfiles = async (): Promise<Map<string, Profile>> => {
  const rows = await getDb().select().from(profiles).where(eq(profiles.published, true));
  return load(rows);
};

export const saveProfile = async (userId: string, profile: Profile): Promise<Profile> => {
  const db = getDb();
  const now = Date.now();
  const row = {
    userId,
    name: profile.name,
    cityId: profile.cityId,
    lat: profile.location?.lat ?? null,
    lng: profile.location?.lng ?? null,
    specialty: profile.specialty,
    bio: profile.bio,
    photo: profile.photo,
    published: profile.published,
    updatedAt: now,
  };
  const existing = await db.select({ id: projects.id }).from(projects).where(eq(projects.userId, userId));
  // Id роботи в базі унікальний на всіх: префікс користувача, який при читанні знімаємо.
  const works = profile.works.map((work, position) => ({ id: `${userId}:${work.id}`, position, work }));
  const own = tagRows(profile.tags, profile.manualTags, profile.hiddenTags);
  const statements = [
    db.insert(profiles).values(row).onConflictDoUpdate({ target: profiles.userId, set: row }),
    db.delete(profileTags).where(eq(profileTags.userId, userId)),
    ...(existing.length ? [db.delete(projects).where(inArray(projects.id, existing.map((project) => project.id)))] : []),
    ...(own.length ? [db.insert(profileTags).values(own.map((tag) => ({ userId, ...tag })))] : []),
    ...works.map(({ id, position, work }) => db.insert(projects).values({ id, userId, position, title: work.title, description: work.description, url: work.url })),
    ...works.flatMap(({ id, work }) => {
      const rows = tagRows(work.tags, work.manualTags, work.hiddenTags);
      return rows.length ? [db.insert(projectTags).values(rows.map((tag) => ({ projectId: id, ...tag })))] : [];
    }),
  ];
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  const saved = await getProfile(userId);
  return saved ?? { ...emptyProfile(), ...profile, updatedAt: iso(now) };
};

export const deleteProfile = async (userId: string) => {
  await getDb().delete(profiles).where(eq(profiles.userId, userId));
  const db = getDb();
  await db.delete(profileTags).where(eq(profileTags.userId, userId));
  await db.delete(projects).where(eq(projects.userId, userId));
};
