"use client";

// components/wallet/direct-wallet-pay-panel.tsx
//
// Оплата USDT з гаманця в картці прямого переказу: підключення, сума, адреса виконавця повністю з проханням звірити
// її на пристрої, кнопка платежу й прозорі стани (схвалення, підтвердження, перевірка сайтом).

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field, Input } from "@/components/ui/input";
import { chainById } from "@/lib/crypto/chains";
import type { PublicCryptoConfig } from "@/lib/crypto/config";
import { useDirectWalletPay } from "./use-direct-wallet-pay";
import { useWalletConnection } from "./use-wallet-connection";
import { WalletConnectBox } from "./wallet-connect-box";
import { WalletShell } from "./wallet-shell";

export namespace DirectWalletPayPanelTypes {
  export interface Props {
    dealId: string;
    stageId: string;
    recipient: string;
    config: PublicCryptoConfig;
    onPaid: () => void;
  }
}

const Inner = ({ dealId, stageId, recipient, config, onPaid }: DirectWalletPayPanelTypes.Props) => {
  const wallet = useWalletConnection(config.chainId);
  const pay = useDirectWalletPay({ dealId, stageId, recipient, crypto: config, onPaid });
  const id = `wallet-pay-${dealId}`;
  return (
    <div className="grid gap-3">
      <WalletConnectBox wallet={wallet} networkName={chainById(config.chainId).name} />
      {pay.ready && (
        <>
          <Field label="Сума, USDT" htmlFor={`${id}-amount`} hint="Курс ви домовляєтеся з виконавцем у чаті: сайт суму не перевіряє, її підтвердить виконавець.">
            <Input id={`${id}-amount`} inputMode="decimal" autoComplete="off" value={pay.amount} maxLength={16} className="tabular-nums" onChange={(event) => pay.setAmount(event.target.value)} />
          </Field>
          <div className="text-xs leading-snug">
            <p className="text-ink-muted">Адреса виконавця</p>
            <p className="break-all font-medium tabular-nums text-ink">{recipient}</p>
          </div>
          <CheckboxField id={`${id}-verified`} checked={pay.verified} onCheckedChange={(value) => pay.setVerified(value === true)} label="Адресу на екрані гаманця (на пристрої) звірено з цією повністю" />
          {config.router ? (
            <p className="pe-hint">Платіж іде через контракт сервісу: ви схвалюєте рівно суму разом з комісією, ніколи не безмежно.</p>
          ) : (
            <p className="pe-hint">Платіж іде прямим переказом токена виконавцю, без комісії.</p>
          )}
          <Button disabled={!pay.canPay} onClick={() => void pay.pay()} className="w-auto">
            {pay.working && <Loader2 className="size-4 animate-spin" />}
            Оплатити з гаманця
          </Button>
        </>
      )}
      {pay.status && (
        <p role="status" className="pe-hint">
          {pay.status}
        </p>
      )}
      {pay.error && (
        <p role="alert" className="auth-error">
          {pay.error}
        </p>
      )}
      {pay.hash && pay.phase === "checking" && pay.error && (
        <Button variant="secondary" onClick={() => void pay.recheck()} className="w-auto">
          Перевірити ще раз
        </Button>
      )}
    </div>
  );
};

const DirectWalletPayPanel = (props: DirectWalletPayPanelTypes.Props) => (
  <WalletShell config={props.config}>
    <Inner {...props} />
  </WalletShell>
);

export default DirectWalletPayPanel;
