"use client";

// components/wallet/use-wallet-connection.ts
//
// Підключення гаманця: список коннекторів, підключення, відключення, перемикання мережі. Для WalletConnect без
// готового вікна ловимо посилання сполучення (display_uri) і віддаємо його для власного QR.

import { useRef, useState } from "react";
import { connect, disconnect, switchChain } from "wagmi/actions";
import { useConfig, useConnection, useConnectors } from "wagmi";
import { CONNECT_TIMEOUT_MS, injectedMissing, isWalletCancelled, withTimeout } from "@/lib/crypto/wallet-connect";
import { walletErrorText } from "@/lib/crypto/wallet-errors";

export const useWalletConnection = (chainId: number) => {
  const config = useConfig();
  const connectors = useConnectors();
  const connection = useConnection();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairingUri, setPairingUri] = useState<string | null>(null);
  /** Розширення гаманця в браузері немає: показуємо, де його взяти, а не загальну помилку. */
  const [missing, setMissing] = useState(false);
  const aborter = useRef<AbortController | null>(null);

  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await task();
    } catch (reason) {
      if (!isWalletCancelled(reason)) setError(walletErrorText(reason));
    } finally {
      setBusy(null);
      setPairingUri(null);
    }
  };

  const connectWith = (id: string) => {
    const connector = connectors.find((item) => item.uid === id);
    if (!connector) return Promise.resolve();
    setMissing(false);
    if (injectedMissing(connector.type, typeof window !== "undefined" && "ethereum" in window)) {
      setError(null);
      setMissing(true);
      return Promise.resolve();
    }
    return run(id, async () => {
      const onMessage = (message: { type: string; data?: unknown }) => message.type === "display_uri" && typeof message.data === "string" && setPairingUri(message.data);
      connector.emitter.on("message", onMessage);
      const abort = new AbortController();
      aborter.current = abort;
      const attempt = connect(config, { connector, chainId });
      try {
        await withTimeout(attempt, CONNECT_TIMEOUT_MS, abort.signal);
      } catch (reason) {
        // Підключення кинули, а гаманець відповів пізніше: не лишаємо людину підключеною без її відома.
        void attempt.then(() => disconnect(config)).catch(() => undefined);
        throw reason;
      } finally {
        aborter.current = null;
        connector.emitter.off("message", onMessage);
      }
    });
  };

  const cancel = () => aborter.current?.abort();

  const switchNetwork = () => run("switch", () => switchChain(config, { chainId }));
  const leave = () => run("leave", () => disconnect(config));

  return {
    connectors: connectors.map((item) => ({ id: item.uid, name: item.name, type: item.type })),
    /** Є WalletConnect: до нього можна відіслати того, хто без розширення. */
    hasWalletConnect: connectors.some((item) => item.type === "walletConnect"),
    missing,
    address: connection.address ?? null,
    connected: connection.status === "connected",
    wrongNetwork: connection.status === "connected" && connection.chainId !== chainId,
    busy,
    error,
    pairingUri,
    connectWith,
    cancel,
    switchNetwork,
    leave,
  };
};

export type WalletConnection = ReturnType<typeof useWalletConnection>;
