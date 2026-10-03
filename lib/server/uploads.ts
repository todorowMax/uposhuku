// lib/server/uploads.ts
//
// Файли в R2. Тип визначаємо за першими байтами, а не за тим, що сказав
// клієнт; SVG не приймаємо (у ньому може бути скрипт). Ключі містять
// випадковий UUID, тож їх можна кешувати назавжди.

import { getCloudflareContext } from "@opennextjs/cloudflare";

export const PHOTO_MAX_BYTES = 300_000;
export const PHOTO_PREFIX = "photos/";
export const UPLOAD_URL_PREFIX = "/api/uploads/";

export const getBucket = (): R2Bucket => {
  const testBucket = (globalThis as { __TEST_R2?: R2Bucket }).__TEST_R2;
  const bucket = testBucket ?? getCloudflareContext().env.UPLOADS;
  if (!bucket) throw new Error("Немає привʼязки R2 «UPLOADS» у цьому середовищі");
  return bucket;
};

export type ImageType = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

/** Формат зображення за магічними байтами; інше (зокрема SVG) відхиляємо. */
export const sniffImage = (bytes: Uint8Array): ImageType | null => {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length > 7 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (bytes.length > 11 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { mime: "image/webp", ext: "webp" };
  return null;
};

export const photoKeyPrefix = (userId: string) => `${PHOTO_PREFIX}${userId}/`;

/** Кладе фото в R2 і повертає публічну адресу виду /api/uploads/photos/<user>/<uuid>.jpg. */
export const putPhoto = async (userId: string, bytes: Uint8Array): Promise<{ url: string } | string> => {
  if (bytes.length === 0) return "Порожній файл.";
  if (bytes.length > PHOTO_MAX_BYTES) return "Фото завелике: до 300 КБ.";
  const type = sniffImage(bytes);
  if (!type) return "Фото має бути JPEG, PNG або WebP.";
  const key = `${photoKeyPrefix(userId)}${crypto.randomUUID()}.${type.ext}`;
  await getBucket().put(key, bytes, { httpMetadata: { contentType: type.mime, cacheControl: "public, max-age=31536000, immutable" } });
  return { url: `${UPLOAD_URL_PREFIX}${key}` };
};

/** Фото з data URL (старий формат профілю) → R2. */
export const putPhotoFromDataUrl = async (userId: string, dataUrl: string) => {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return "Фото має бути JPEG, PNG або WebP.";
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return putPhoto(userId, bytes);
};

/** Ключ у R2 з адреси /api/uploads/…; чужі й сторонні адреси дають null. */
export const keyFromUrl = (url: string, userId?: string): string | null => {
  if (!url.startsWith(UPLOAD_URL_PREFIX)) return null;
  const key = url.slice(UPLOAD_URL_PREFIX.length);
  if (!key.startsWith(PHOTO_PREFIX) || key.includes("..")) return null;
  return userId && !key.startsWith(photoKeyPrefix(userId)) ? null : key;
};

export const deleteByUrl = async (url: string, userId: string) => {
  const key = keyFromUrl(url, userId);
  if (key) await getBucket().delete(key);
};
