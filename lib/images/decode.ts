// lib/images/decode.ts
//
// Перенесено з ukoshiku (lib/image-decode.ts): читання фото з телефона в
// будь-якому форматі, зокрема HEIC з айфона.
"use client";

/**
 * Прочитати фото з телефона, хоч би в якому форматі воно прийшло.
 *
 * Айфон знімає в HEIC, частина Android (Samsung, Xiaomi з «економним»
 * форматом) — у HEIF. Safari такі файли відкриває сам, Chrome — ні: ні на
 * Android, ні на Mac. До цього модуля такий файл ішов на сервер як є, і
 * людина бачила «Підійде JPEG, PNG або WebP» замість обкладинки.
 *
 * Спершу пробуємо браузер. Лише коли він не впорався з HEIC, довантажуємо
 * декодер — окремим шматком, щоб решта людей за нього не платила трафіком.
 */

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
/** Бренди контейнера ISO BMFF, під якими пишуть HEIC/HEIF. */
const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

/**
 * HEIC за типом, розширенням або першими байтами.
 *
 * Байти потрібні тому, що тип довіряти не можна: з «Файлів» на айфоні чи з
 * Google Drive HEIC приходить із порожнім `type`, інколи й без розширення.
 */
export const isHeicLike = async (file: File): Promise<boolean> => {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  if (/\.hei[cf]$/i.test(file.name)) return true;
  if (file.type !== "" && file.type !== "application/octet-stream") return false;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return isHeicBytes(head);
};

export const isHeicBytes = (head: Uint8Array): boolean => {
  if (head.length < 12) return false;
  const box = String.fromCharCode(...head.slice(4, 8));
  const brand = String.fromCharCode(...head.slice(8, 12));
  return box === "ftyp" && HEIC_BRANDS.has(brand);
};

/**
 * Чи схоже на картинку взагалі: тип `image/*`, або порожній тип, але
 * перші байти JPEG, PNG, WebP чи HEIC — так буває з файлових менеджерів.
 */
export const isImageFile = async (file: File): Promise<boolean> => {
  if (file.type.startsWith("image/")) return true;
  if (file.type !== "" && file.type !== "application/octet-stream") return false;
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (signature: number[]) => signature.every((byte, index) => head[index] === byte);
  return (
    starts([0xff, 0xd8, 0xff]) ||
    starts([0x89, 0x50, 0x4e, 0x47]) ||
    (starts([0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...head.slice(8, 12)) === "WEBP") ||
    isHeicBytes(head)
  );
};

const heicToJpegBlob = async (file: File): Promise<Blob> => {
  const { heicTo } = await import("heic-to");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
};

/**
 * Розкодувати в `ImageBitmap` для канваса.
 *
 * Кидає помилку, коли прочитати не вдалося зовсім: краще чесно сказати
 * «не вийшло прочитати фото», ніж відправити сирий файл, який сервер
 * однаково відхилить.
 */
export const decodeImage = async (file: File): Promise<ImageBitmap> => {
  try {
    return await createImageBitmap(file);
  } catch (cause) {
    if (!(await isHeicLike(file))) throw cause;
    return createImageBitmap(await heicToJpegBlob(file));
  }
};
