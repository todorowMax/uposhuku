"use client";

// components/wallet/use-escrow-panel.ts
//
// Дії з ескроу в гаманці. Замовник вносить (схвалення рівно на суму з комісією), приймає роботу, відкриває спір,
// повертає кошти після простроченої здачі; виконавець здає, відкриває спір, забирає кошти після перевірки. Кожну
// транзакцію підписує власник гаманця; після неї сайт просить сервер звірити етап зі станом контракту, статус етапу
// ставить лише звірка. Ставка комісії читається з контракту через провайдер гаманця.

import { useEffect, useState } from "react";
import { getAddress, type Address } from "viem";
import { useConfig, useConnection } from "wagmi";
import { ApiError } from "@/lib/auth/client";
import { syncEscrow } from "@/lib/crypto/client";
import type { PublicCryptoConfig } from "@/lib/crypto/config";
import { dealRefOf } from "@/lib/crypto/deal-ref";
import { escrowButtons, type EscrowRole } from "@/lib/crypto/escrow-ui";
import { actOnEscrow, createEscrowDeal, type EscrowAction } from "@/lib/crypto/escrow-flow";
import { escrowFactoryAbi } from "@/lib/crypto/abi/escrow-factory";
import { WalletFlowError, type PayPhase } from "@/lib/crypto/pay-flow";
import { USDT_DECIMALS } from "@/lib/crypto/units";
import { readViaWallet, waitReceiptViaWallet } from "@/lib/crypto/wallet-read";
import { walletErrorText } from "@/lib/crypto/wallet-errors";
import { ensureRiskAck, withRiskAck } from "@/lib/legal/client";
import { ESCROW_REVIEW_DAYS, type Deal, type DealStage } from "@/lib/deals/types";

export namespace EscrowPanelTypes {
  export type Phase = "idle" | PayPhase | "mining" | "syncing" | "done";
  export type Act = "deposit" | EscrowAction;
  export interface Options {
    deal: Deal;
    stage: DealStage;
    side: EscrowRole;
    crypto: PublicCryptoConfig;
    performerWallet: string | null;
    onChanged: () => void;
  }
}

const DAY = 86_400;
const UNIT = 10n ** BigInt(USDT_DECIMALS);

const PHASE_TEXT: Record<EscrowPanelTypes.Phase, string> = {
  idle: "",
  approving: "Підтвердьте схвалення в гаманці: лише на суму цього етапу разом з комісією.",
  paying: "Підтвердьте транзакцію в гаманці та звірте адреси на екрані пристрою.",
  mining: "Чекаємо, поки мережа прийме транзакцію…",
  syncing: "Сайт звіряє етап зі станом контракту…",
  done: "Готово: етап оновлено за станом контракту.",
};

const sameAddress = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export const useEscrowPanel = (options: EscrowPanelTypes.Options) => {
  const { deal, stage, side, crypto, performerWallet, onChanged } = options;
  const config = useConfig();
  const connection = useConnection();
  const [verified, setVerified] = useState(false);
  const [phase, setPhase] = useState<EscrowPanelTypes.Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feeBps, setFeeBps] = useState<number | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  // Час для кнопок за строками: оновлюємо раз на півхвилини, а не читаємо годинник під час відображення.
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(timer);
  }, []);

  const owner = connection.address as Address | undefined;
  const ready = connection.status === "connected" && connection.chainId === crypto.chainId;
  const buttons = escrowButtons({ role: side, stage, nowSeconds });
  const units = BigInt(stage.amount) * UNIT;
  // Гаманець має бути тим, що в угоді: виконавець підписує своєю адресою, замовник тим, з якого вносив.
  const wrongWallet = ready && Boolean(owner) && (side === "performer" ? !sameAddress(owner, performerWallet) : Boolean(stage.escrow) && !sameAddress(owner, stage.escrow?.client));
  const working = phase !== "idle" && phase !== "done";

  // Ставка комісії з контракту: показуємо людям те, що справді спишеться.
  useEffect(() => {
    if (!ready || !crypto.factory) return;
    let cancelled = false;
    readViaWallet(config, { chainId: crypto.chainId, abi: escrowFactoryAbi, address: crypto.factory, functionName: "FEE_BPS" })
      .then((value) => !cancelled && setFeeBps(Number(value)))
      .catch(() => !cancelled && setFeeBps(null));
    return () => {
      cancelled = true;
    };
  }, [ready, config, crypto.chainId, crypto.factory]);

  const reconcile = async (client?: string) => {
    setPhase("syncing");
    try {
      await withRiskAck(() => syncEscrow(deal.id, stage.id, client));
      setNeedsSync(false);
      setPhase("done");
      onChanged();
    } catch (reason) {
      // Транзакцію вже підтверджено мережею: гроші на місці, не виконано лише звірку сайту. Дозволяємо повторити її.
      setNeedsSync(true);
      setPhase("idle");
      setError(reason instanceof ApiError ? reason.message : "Транзакцію виконано, але сайт ще не зміг її звірити. Натисніть «Звірити ще раз».");
    }
  };

  const run = async (act: EscrowPanelTypes.Act) => {
    if (!ready || !owner || working || wrongWallet) return;
    setError(null);
    try {
      if (act === "deposit") {
        // Внесення це транзакція в гаманці, її сервер не зупинить: ризик підтверджуємо до неї.
        if (!(await ensureRiskAck())) throw new WalletFlowError("Без підтвердження ризиків внесення в ескроу не починаємо.");
        if (!performerWallet) throw new WalletFlowError("Виконавець не підтвердив адресу гаманця.");
        const hash = await createEscrowDeal({
          config,
          crypto,
          owner,
          deal: { performer: getAddress(performerWallet), amount: units, deliverBy: BigInt(Math.floor(Date.now() / 1000) + stage.days * DAY), reviewPeriod: BigInt(ESCROW_REVIEW_DAYS * DAY), dealRef: dealRefOf(deal.id, stage.id) },
          onPhase: setPhase,
        });
        setPhase("mining");
        const receipt = await waitReceiptViaWallet(config, { hash, chainId: crypto.chainId });
        if (receipt.status !== "success") throw new WalletFlowError("Транзакцію не виконано в мережі. Гроші не списано.");
      } else {
        if (!stage.escrow) throw new WalletFlowError("Адреса контракту етапу ще невідома: натисніть «Звірити ще раз».");
        setPhase("paying");
        await actOnEscrow({ config, chainId: crypto.chainId, escrow: getAddress(stage.escrow.address), action: act });
      }
      await reconcile(owner);
    } catch (reason) {
      setPhase("idle");
      setError(reason instanceof ApiError || reason instanceof WalletFlowError ? reason.message : walletErrorText(reason));
    }
  };

  return { owner, ready, wrongWallet, buttons, units, feeBps, verified, setVerified, phase, working, status: PHASE_TEXT[phase], error, needsSync, run, resync: () => reconcile(owner) };
};
