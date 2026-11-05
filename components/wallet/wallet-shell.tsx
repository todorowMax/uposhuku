"use client";

// components/wallet/wallet-shell.tsx
//
// Провайдери wagmi і react-query для однієї панелі гаманця. Живуть лише всередині динамічно завантажених панелей,
// тому ні головна, ні карта не тягнуть жодного байта wagmi.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import type { PublicCryptoConfig } from "@/lib/crypto/config";
import { createWalletConfig } from "./wallet-config";

export const WalletShell = ({ config, children }: { config: PublicCryptoConfig; children: ReactNode }) => {
  const [wagmi] = useState(() => createWalletConfig(config, process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID));
  const [queries] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmi}>
      <QueryClientProvider client={queries}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
};
