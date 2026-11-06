"use client";

// components/wallet/use-crypto-config.ts
//
// Публічні налаштування оплати з гаманця для цієї людини (один запит). Тут немає ні wagmi, ні viem: хук безпечно
// підключати на будь-якій сторінці. null, поки запит іде або функція вимкнена.

import { useEffect, useState } from "react";
import { fetchCryptoConfig } from "@/lib/crypto/client";
import type { PublicCryptoConfig } from "@/lib/crypto/config";

export const useCryptoConfig = (): PublicCryptoConfig | null => {
  const [config, setConfig] = useState<PublicCryptoConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCryptoConfig()
      .then((value) => !cancelled && setConfig(value.wallet ? value.config : null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
};

/** Чи доступне цій людині ескроу (прапорець `crypto_escrow` і фабрика). Лише для показу вибору: рішення завжди за сервером. */
export const useEscrowAvailable = (): boolean => {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchCryptoConfig()
      .then((value) => !cancelled && setAvailable(value.escrow))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
};
