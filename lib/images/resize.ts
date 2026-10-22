// lib/images/resize.ts
//
// Стискає фото в браузері до відправки (з ukoshiku, lib/image-resize.ts):
// кадр по центру в квадрат, бо аватар скрізь круглий. Для профілю
// повертаємо data URL: R2 ще немає, а ~30 КБ спокійно їдуть в JSON.
"use client";

import { decodeImage } from "./decode";

export const resizeToSquareJpegDataUrl = async (file: File, side = 320, quality = 0.84): Promise<string> => {
  const bitmap = await decodeImage(file);
  try {
    const crop = Math.min(bitmap.width, bitmap.height);
    const sx = Math.round((bitmap.width - crop) / 2);
    const sy = Math.round((bitmap.height - crop) / 2);
    // Не розтягуємо дрібні картинки: збільшення лише додасть ваги.
    const target = Math.min(side, crop);
    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas недоступний");
    context.drawImage(bitmap, sx, sy, crop, crop, 0, 0, target, target);
    const url = canvas.toDataURL("image/jpeg", quality);
    if (!url.startsWith("data:image/jpeg")) throw new Error("не вдалося стиснути");
    return url;
  } finally {
    bitmap.close();
  }
};

/**
 * Фото для чату: довга сторона до `maxSide`, WebP (де браузер не вміє, JPEG).
 * Телефонне фото 3–5 МБ стає 150–300 КБ; дрібні картинки не збільшуємо.
 */
export const compressForChat = async (file: File, maxSide = 1600, quality = 0.8): Promise<Blob> => {
  const bitmap = await decodeImage(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas недоступний");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    // Safari мовчки віддає PNG на запит WebP: тоді беремо JPEG.
    const webp = await toBlob("image/webp");
    const blob = webp && webp.type === "image/webp" ? webp : await toBlob("image/jpeg");
    if (!blob) throw new Error("не вдалося стиснути");
    return blob;
  } finally {
    bitmap.close();
  }
};
