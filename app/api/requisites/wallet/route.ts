// POST /api/requisites/wallet { nonce, signature } — підтвердження адреси гаманця виконавця підписом. Сервер
// сам збирає повідомлення за рядком запиту в базі й перевіряє підпис через viem. Адреса йде в реквізити тим
// самим шляхом, що й зміна реквізитів: чекає 24 години, виконавцю надходить лист.

import { problem, readJson } from "@/lib/api/problem";
import { buildWalletMessage, isWalletSignatureValid } from "@/lib/crypto/wallet-sign";
import { getSessionUser } from "@/lib/server/auth";
import { walletConfigFor } from "@/lib/server/crypto-config";
import { cryptoGate } from "@/lib/server/legal-gate";
import { sendRequisitesChangeNotice } from "@/lib/server/mail";
import { rateLimited } from "@/lib/server/rate-limit";
import { attachWalletAddress } from "@/lib/server/requisites-repo";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";
import { consumeChallenge } from "@/lib/server/wallet-repo";
import { logServer } from "@/lib/telemetry/log";

export const POST = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("walletVerify", user.id);
    if (limited) return limited;
    if (!(await walletConfigFor(user.email))) return problem(409, "Оплата з гаманця недоступна", "Оплата з гаманця ще не відкрита для вашого акаунта.");
    const refused = await cryptoGate(user.id);
    if (refused) return refused;
    const body = await readJson(request);
    if (typeof body?.nonce !== "string" || typeof body?.signature !== "string") return problem(400, "Підпис не отримано");
    const challenge = await consumeChallenge({ userId: user.id, nonce: body.nonce });
    if (!challenge || challenge.domain !== new URL(request.url).host) return problem(409, "Запит на підпис застарів", "Запит діє 10 хвилин і лише один раз. Почніть підтвердження знову.");
    const message = buildWalletMessage({ domain: challenge.domain, address: challenge.address, nonce: challenge.nonce, issuedAt: challenge.createdAt, expiresAt: challenge.expiresAt });
    if (!(await isWalletSignatureValid({ address: challenge.address as `0x${string}`, message, signature: body.signature }))) return problem(400, "Підпис не збігається з адресою", "Підпишіть повідомлення тим гаманцем, адресу якого підтверджуєте.");
    const outcome = await attachWalletAddress(user.id, challenge.address);
    if (outcome.kind === "no_requisites") return problem(409, "Спершу збережіть реквізити", "Адресу гаманця додаємо до реквізитів: збережіть їх вище й повторіть.");
    if (outcome.kind === "pending") {
      try {
        await sendRequisitesChangeNotice(user.email, outcome.effectiveAt);
      } catch {
        logServer({ level: "error", event: "requisites_notice_failed", message: "Не вдалося надіслати лист про зміну реквізитів", detail: {} });
      }
    }
    return Response.json({ outcome, address: challenge.address }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SecretBoxUnavailableError) return problem(503, "Реквізити тимчасово недоступні", "Спробуйте пізніше.");
    return failure(error, request);
  }
};
