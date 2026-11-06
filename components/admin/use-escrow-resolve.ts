"use client";

// components/admin/use-escrow-resolve.ts
//
// Рішення спору ескроу: запит на підготовку транзакції resolve(percent). Сервер нічого не підписує, він віддає адресу,
// мережу й calldata для мультипідпису; хук тримає відсоток, коментар і готовий результат.

import { useState } from "react";
import { DECISION_COMMENT_MAX, DECISION_COMMENT_MIN } from "@/lib/admin/types";
import { checkResolvePercent, type ResolveTransaction } from "@/lib/crypto/escrow-resolve";

export const useEscrowResolve = (input: { dealId: string; stageId: string }) => {
  const { dealId, stageId } = input;
  const [percent, setPercent] = useState("50");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<ResolveTransaction | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const percentNumber = percent === "" ? NaN : Number(percent);
  const percentValid = typeof checkResolvePercent(percentNumber) === "number";
  const length = comment.trim().length;
  const commentError = length > 0 && length < DECISION_COMMENT_MIN ? `Поясніть рішення: хоча б ${DECISION_COMMENT_MIN} символів.` : null;
  const ready = percentValid && length >= DECISION_COMMENT_MIN && length <= DECISION_COMMENT_MAX;

  const prepare = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/disputes/${encodeURIComponent(dealId)}/escrow-resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId, percent: percentNumber, comment }),
      });
      const body = (await response.json().catch(() => null)) as { transaction?: ResolveTransaction; detail?: string } | null;
      if (!response.ok || !body?.transaction) {
        setError(body?.detail ?? "Не вдалося підготувати рішення. Спробуйте ще раз.");
        return;
      }
      setPrepared(body.transaction);
    } catch {
      setError("Немає зв'язку з сервером. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied(null);
    }
  };

  return { percent, setPercent: (value: string) => setPercent(value.replace(/\D/g, "").slice(0, 3)), comment, setComment, percentValid, commentError, ready, busy, error, prepared, copied, prepare, copy };
};
