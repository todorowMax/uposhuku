// lib/deals/qr-path.ts
//
// Матриця QR (true — темний модуль) у шлях SVG: підряд темні модулі рядка зливаються в один прямокутник.

export const qrPath = (matrix: readonly (readonly boolean[])[]): string => {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return parts.join("");
};
