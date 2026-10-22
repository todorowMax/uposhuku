// GET /api/admin/disputes — черга спорів для модератора: відкриті й нещодавно розглянуті.
// Лише для адміністраторів (ADMIN_EMAILS); решті відповідаємо 404.

import { problem } from "@/lib/api/problem";
import { getAdmin } from "@/lib/server/admin";
import { listDisputes } from "@/lib/server/admin-repo";
import { failure } from "@/lib/server/route";

export async function GET(request: Request) {
  try {
    if (!(await getAdmin())) return problem(404, "Не знайдено");
    return Response.json(await listDisputes(), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failure(error, request);
  }
}
