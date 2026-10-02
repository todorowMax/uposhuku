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
