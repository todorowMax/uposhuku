// lib/map/portrait.ts
//
// Портрети виконавців для маркерів карти. Малюємо на полотні в браузері
// з локального атласу вигаданих облич 4×4 (public/map/mock-avatars.png),
// без окремого мережевого запиту на кожне фото.

/** Сторона полотна портрета, пікселі. */
export const PORTRAIT_SIZE = 192;

/** Атлас портретів, 16 облич. */
export const AVATAR_ATLAS = "/map/mock-avatars.png";
export const AVATAR_COUNT = 16;

const drawPortrait = (
  context: CanvasRenderingContext2D,
  source: HTMLImageElement,
  index: number,
  x: number,
  y: number,
  radius: number
) => {
  const cell = source.naturalWidth / 4;
  const column = index % 4;
  const row = Math.floor(index / 4) % 4;
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  context.drawImage(source, column * cell, row * cell, cell, cell, x - radius, y - radius, radius * 2, radius * 2);
  context.restore();
};

/**
 * Маркер-портрет на полотні 192×192: фото у світлому кільці й маленький
 * якір знизу. MapLibre бере його як зображення символу.
 */
export const createPortraitCanvas = (source: HTMLImageElement, index: number, selected = false) => {
  const canvas = document.createElement("canvas");
  canvas.width = PORTRAIT_SIZE;
  canvas.height = PORTRAIT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  // Фото й маленький якір з'єднані в один «живий» маркер. Контур
  // залишає портрет упізнаваним навіть у найменшому платному рівні.
  context.shadowColor = selected ? "rgba(172, 103, 57, .48)" : "rgba(48, 68, 64, .22)";
  context.shadowBlur = selected ? 32 : 17;
  context.shadowOffsetY = 6;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(96, 83, 72, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  drawPortrait(context, source, index, 96, 83, 65);
  context.strokeStyle = "#ffffff";
  context.lineWidth = 8;
  context.beginPath();
  context.arc(96, 83, 69, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = selected ? "#e9a26d" : "#a3bdb0";
  context.lineWidth = selected ? 10 : 5;
  context.beginPath();
  context.arc(96, 83, 75, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = selected ? "#e9a26d" : "#a3bdb0";
  context.beginPath();
  context.moveTo(82, 152);
  context.quadraticCurveTo(96, 183, 110, 152);
  context.closePath();
  context.fill();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(96, 162, 4, 0, Math.PI * 2);
  context.fill();
  return canvas;
};
