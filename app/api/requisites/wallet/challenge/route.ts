// POST /api/requisites/wallet/challenge { address } — запит на підпис: сервер видає текст повідомлення з доменом,
// адресою, одноразовим кодом і строком. Людина підписує його гаманцем і надсилає на /api/requisites/wallet.

import { getAddress, isAddress } from "viem";
import { problem, readJson } from "@/lib/api/problem";
import { buildWalletMessage } from "@/lib/crypto/wallet-sign";
import { getSessionUser } from "@/lib/server/auth";
import { walletConfigFor } from "@/lib/server/crypto-config";
import { cryptoGate } from "@/lib/server/legal-gate";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";
import { createChallenge } from "@/lib/server/wallet-repo";

export const POST = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("walletChallenge", user.id);
    if (limited) return limited;
    if (!(await walletConfigFor(user.email))) return problem(409, "Оплата з гаманця недоступна", "Оплата з гаманця ще не відкрита для вашого акаунта.");
    const refused = await cryptoGate(user.id);
    if (refused) return refused;
    const raw = (await readJson(request))?.address;
    if (typeof raw !== "string" || !isAddress(raw, { strict: false })) return problem(400, "Адреса некоректна", "Потрібна адреса EVM: 0x і 40 символів.");
    const address = getAddress(raw.toLowerCase());
    const challenge = await createChallenge({ userId: user.id, address, domain: new URL(request.url).host });
    const message = buildWalletMessage({ domain: challenge.domain, address, nonce: challenge.nonce, issuedAt: challenge.createdAt, expiresAt: challenge.expiresAt });
    return Response.json({ nonce: challenge.nonce, message }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
