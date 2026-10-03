// /api/placement — розміщення на карті поточної людини.
// GET — скільки сплачено, рівень, історія; POST {amount, simulate?} — оплатити.
// Справжня версія: POST створює рахунок у Monobank і повертає посилання на
// оплату, а рівень змінює лише вебхук з підписом ECDSA.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { addPayment, getPlacement } from "@/lib/server/placement-repo";
import { MAX_PAYMENT, MIN_PAYMENT } from "@/lib/placement/tiers";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  return Response.json({ placement: await getPlacement(user.id) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  const amount = typeof body?.amount === "number" ? Math.round(body.amount) : NaN;
  if (!Number.isFinite(amount) || amount < MIN_PAYMENT || amount > MAX_PAYMENT) {
    return problem(400, "Сума не підходить", `Сума від ${MIN_PAYMENT} до ${MAX_PAYMENT} ₴.`);
  }
  // Тестова відмова, щоб побачити, як виглядає невдала оплата.
  if (body?.simulate === "declined") return problem(402, "Оплату відхилено", "Банк відхилив платіж. Гроші не списано, спробуйте іншу картку.", "/problems/payment-declined");
  return Response.json({ placement: await addPayment(user.id, amount) }, { status: 201 });
}
