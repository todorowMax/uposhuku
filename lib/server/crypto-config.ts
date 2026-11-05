// lib/server/crypto-config.ts
//
// Налаштування оплат з гаманця із середовища сервера й рішення, чи доступні вони цій людині. Прапорець без
// повної конфігурації (мережа, токен, RPC) не вмикає нічого. Ескроу додатково потребує адреси фабрики.

import { parseCryptoConfig, type CryptoConfig } from "@/lib/crypto/config";
import { readVar } from "./env";
import { featureEnabledFor } from "./features";

export const cryptoConfig = (): CryptoConfig | null =>
  parseCryptoConfig({
    chainId: readVar("CRYPTO_CHAIN_ID"),
    token: readVar("CRYPTO_TOKEN_ADDRESS"),
    router: readVar("CRYPTO_ROUTER_ADDRESS"),
    factory: readVar("CRYPTO_FACTORY_ADDRESS"),
    rpcUrl: readVar("CRYPTO_RPC_URL"),
  });

/** Конфігурація, якщо оплата з гаманця доступна цій пошті: прапорець `crypto_wallet` і повні налаштування. */
export const walletConfigFor = async (email: string | null | undefined): Promise<CryptoConfig | null> => {
  const config = cryptoConfig();
  return config && (await featureEnabledFor("crypto_wallet", email)) ? config : null;
};

/** Те саме для ескроу: прапорець `crypto_escrow` і адреса фабрики. */
export const escrowConfigFor = async (email: string | null | undefined): Promise<CryptoConfig | null> => {
  const config = cryptoConfig();
  return config?.factory && (await featureEnabledFor("crypto_escrow", email)) ? config : null;
};
