// GET /api/deals/:id/escrow — дані для ескроу в картці угоди: підтверджена адреса гаманця виконавця зі знімка угоди і
// публічні налаштування мережі. Лише сторони угоди, лише ескроу, лише коли задано фабрику (прапорець потрібен створювачу угоди, не другій стороні).

import { problem } from "@/lib/api/problem";
import { toPublicConfig } from "@/lib/crypto/config";
import { getSessionUser } from "@/lib/server/auth";
import { cryptoConfig } from "@/lib/server/crypto-config";
import { dealForParty } from "@/lib/server/deal-access";
import { rateLimited } from "@/lib/server/rate-limit";
import { dealWalletAddress } from "@/lib/server/requisites-repo";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("escrowSync", user.id);
    if (limited) return limited;
    const dealId = (await params).id;
    const deal = await dealForParty(dealId, user.id);
    if (!deal || deal.method !== "escrow" || deal.status !== "accepted") return problem(404, "Угоду не знайдено");
    // Прапорець `crypto_escrow` потрібен тому, хто створює угоду; друга сторона працює з нею без нього.
    const config = cryptoConfig();
    if (!config?.factory) return problem(409, "Ескроу недоступне", "Ескроу ще не налаштовано.");
    return Response.json({ config: toPublicConfig(config), performerWallet: await dealWalletAddress(deal.id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SecretBoxUnavailableError) return problem(503, "Реквізити тимчасово недоступні", "Спробуйте пізніше.");
    return failure(error, request);
  }
};
