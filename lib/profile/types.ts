// lib/profile/types.ts
//
// Профіль виконавця, спільний для сервера й клієнта. Тексти людина пише
// вільно, а теги розбираємо з них самі (lib/tags): «Про себе» дає
// заявлені навички, кожна робота — підтверджені. Те, що в роботах,
// вагоміше: за запитом «бот для запису» вище той, хто такий бот робив.

export interface ProfileWork {
  id: string;
  title: string;
  /** Що зроблено, для кого, чим: з цього розбираємо теги роботи. */
  description: string;
  url: string;
  tags: string[];
}

export interface Profile {
  name: string;
  cityId: string;
  /** Точка на карті, яку людина поставила сама; без неї стоїмо біля центру міста. */
  location: { lat: number; lng: number } | null;
  /** Коротко, ким працює: «UI/UX дизайнер». Показуємо в картці. */
  specialty: string;
  /** «Про себе» вільним текстом. */
  bio: string;
  /** Заявлені теги з «Про себе» й спеціальності, у тому вигляді, як людина їх залишила. */
  tags: string[];
  works: ProfileWork[];
  /** Фото квадратом, JPEG як data URL. */
  photo: string;
  /** Профіль опубліковано: його бачать замовники, а людина відгукується на запити. На карті вона з'являється лише після оплати розміщення. */
  published: boolean;
  updatedAt: string;
}

export const PROFILE_LIMITS = {
  name: 60,
  specialty: 60,
  bio: 800,
  works: 8,
  workTitle: 80,
  workDescription: 500,
  url: 200,
  /** Фото стискаємо в браузері до ~320px, тож понад це — вже не наше. */
  photoBytes: 200_000,
  minTags: 2,
} as const;

/** Усі теги профілю: спершу заявлені, далі з робіт; без повторів. */
export const profileTags = (profile: Pick<Profile, "tags" | "works">): string[] => [
  ...new Set([...profile.tags, ...profile.works.flatMap((work) => work.tags)]),
];

/** Теги, які підтверджені хоча б однією роботою. */
export const provenTags = (profile: Pick<Profile, "works">): Set<string> => new Set(profile.works.flatMap((work) => work.tags));

/**
 * Чого не вистачає, щоб показатися на карті. Робота не обов'язкова, але
 * профіль з нею вищий за довіру: на це натякаємо, а не вимагаємо.
 */
export const missingForPublish = (profile: Profile): string[] => {
  const missing: string[] = [];
  if (!profile.photo) missing.push("фото");
  if (!profile.name.trim()) missing.push("ім'я");
  if (!profile.cityId) missing.push("місто");
  if (!profile.specialty.trim()) missing.push("спеціальність");
  if (profileTags(profile).length < PROFILE_LIMITS.minTags) missing.push(`щонайменше ${PROFILE_LIMITS.minTags} теги`);
  return missing;
};

export const emptyProfile = (name = ""): Profile => ({
  name,
  cityId: "",
  location: null,
  specialty: "",
  bio: "",
  tags: [],
  works: [],
  photo: "",
  published: false,
  updatedAt: new Date(0).toISOString(),
});
