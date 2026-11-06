// lib/server/read-body.ts
//
// Читання тіла запиту з жорсткою стелею за байтами. Заголовок content-length підробляється або відсутній
// (chunked), тому довіряти йому не можна: читаємо потік зі лічильником і обриваємо, щойно стелю перейдено.

/** Тіло завбільшки до `maxBytes`, або null, якщо воно більше (потік тоді скасовано). */
export const readBodyLimited = async (request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> => {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};
