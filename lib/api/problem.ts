// lib/api/problem.ts
//
// Помилки API у форматі RFC 9457 (application/problem+json), як домовились
// у плані: клієнт показує detail, а за type можна розрізнити причину.

export const problem = (status: number, title: string, detail?: string, type = "about:blank") =>
  new Response(JSON.stringify({ type, title, status, detail: detail ?? title }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });

/** Тіло запиту як об'єкт; зламаний JSON — null. */
export const readJson = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
