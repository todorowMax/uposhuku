"use client";

// components/wallet/use-wallet-connection.ts
//
// Підключення гаманця: список коннекторів, підключення, відключення, перемикання мережі. Для WalletConnect без
// готового вікна ловимо посилання сполучення (display_uri) і віддаємо його для власного QR.

import { useState } from "react";
import { connect, disconnect, switchChain } from "wagmi/actions";
import { useConfig, useConnection, useConnectors } from "wagmi";
import { walletErrorText } from "@/lib/crypto/wallet-errors";

export const useWalletConnection = (chainId: number) => {
  const config = useConfig();
  const connectors = useConnectors();
  const connection = useConnection();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairingUri, setPairingUri] = useState<string | null>(null);

  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await task();
    } catch (reason) {
      setError(walletErrorText(reason));
    } finally {
      setBusy(null);
      setPairingUri(null);
    }
  };

  const connectWith = (id: string) => {
    const connector = connectors.find((item) => item.uid === id);
    if (!connector) return Promise.resolve();
    return run(id, async () => {
      const onMessage = (message: { type: string; data?: unknown }) => message.type === "display_uri" && typeof message.data === "string" && setPairingUri(message.data);
      connector.emitter.on("message", onMessage);
      try {
        await connect(config, { connector, chainId });
      } finally {
        connector.emitter.off("message", onMessage);
      }
    });
  };

  const switchNetwork = () => run("switch", () => switchChain(config, { chainId }));
  const leave = () => run("leave", () => disconnect(config));

  return {
    connectors: connectors.map((item) => ({ id: item.uid, name: item.name })),
    address: connection.address ?? null,
    connected: connection.status === "connected",
    wrongNetwork: connection.status === "connected" && connection.chainId !== chainId,
    busy,
    error,
    pairingUri,
    connectWith,
    switchNetwork,
    leave,
  };
};

export type WalletConnection = ReturnType<typeof useWalletConnection>;
