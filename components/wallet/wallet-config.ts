// components/wallet/wallet-config.ts
//
// Конфігурація wagmi для однієї мережі оплати. Гаманці: injected (розширення в браузері), MetaMask і WalletConnect
// (через нього підключаються холодні гаманці та мобільні). Жодного готового модального вікна: список гаманців і QR
// малюємо самі. Файл підтягується лише динамічно, разом із компонентами оплати.

import { createConfig, http } from "wagmi";
import { injected, metaMask, walletConnect } from "wagmi/connectors";
import { chainById } from "@/lib/crypto/chains";
import type { PublicCryptoConfig } from "@/lib/crypto/config";

export const createWalletConfig = (crypto: Pick<PublicCryptoConfig, "chainId">, projectId: string | undefined) => {
  const chain = chainById(crypto.chainId);
  return createConfig({
    chains: [chain],
    connectors: [injected(), metaMask(), ...(projectId ? [walletConnect({ projectId, showQrModal: false })] : [])],
    transports: { [chain.id]: http() },
    ssr: false,
  });
};

export type WalletConfig = ReturnType<typeof createWalletConfig>;
