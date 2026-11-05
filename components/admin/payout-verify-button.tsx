"use client";

// «Перевірити в банку» для заявки на виплати: звіряє ІПН зі списком отримувачів і оновлює сторінку.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { usePayoutVerify } from "./use-payout-verify";

export const PayoutVerifyButton = ({ userId }: { userId: string }) => {
  const { busy, error, verify } = usePayoutVerify(userId);
  return (
    <div className="mt-2 grid gap-2">
      <Button disabled={busy} onClick={() => void verify()} className="w-auto px-4">
        {busy && <Loader2 className="size-4 animate-spin" />}
        Перевірити в банку
      </Button>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </div>
  );
};
