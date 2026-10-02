// lib/profile/mock-store.ts
//
// Профілі в пам'яті сервера, поки немає D1 (таблиці profiles, projects,
// profile_tags). Живуть до перезапуску dev-сервера, як і запити.

import type { Profile } from "./types";

const store = globalThis as typeof globalThis & { __vmProfiles?: Map<string, Profile> };
const all = () => (store.__vmProfiles ??= new Map());

export const getProfile = (userId: string): Profile | null => all().get(userId) ?? null;

export const saveProfile = (userId: string, profile: Profile): Profile => {
  const saved = { ...profile, updatedAt: new Date().toISOString() };
  all().set(userId, saved);
  return saved;
};

export const deleteProfile = (userId: string) => all().delete(userId);
