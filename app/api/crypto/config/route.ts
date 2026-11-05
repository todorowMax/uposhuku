// GET /api/crypto/config — публічні налаштування оплат з гаманця для цієї людини: мережа й адреси контрактів.
// Без RPC (там може бути ключ). `wallet`/`escrow` false: функція вимкнена прапорцем чи немає адрес в оточенні.

import { problem } from "@/lib/api/problem";
import { toPublicConfig } from "@/lib/crypto/config";
import { getSessionUser } from "@/lib/server/auth";
import { escrowConfigFor, walletConfigFor } from "@/lib/server/crypto-config";
import { failure } from "@/lib/server/route";

export const GET = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const [wallet, escrow] = await Promise.all([walletConfigFor(user.email), escrowConfigFor(user.email)]);
    const config = wallet ?? escrow;
    return Response.json({ wallet: wallet !== null, escrow: escrow !== null, config: config ? toPublicConfig(config) : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
