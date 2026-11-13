"use client";

// components/wallet/escrow-panel.tsx
//
// Ескроу в картці угоди, частина з wagmi (завантажується динамічно). Підключення гаманця, повні адреси виконавця й
// контракту з проханням звірити їх на пристрої, комісія одним рядком з «?» (ставка з контракту), кнопки сторони й
// прозорі стани: очікування, відмова, невірна мережа. Сайт гаманцем не керує: кожну транзакцію підтверджує власник.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chainById } from "@/lib/crypto/chains";
import type { PublicCryptoConfig } from "@/lib/crypto/config";
import { feeLabel } from "@/lib/crypto/fee-label";
import { SETTLE_LABEL, type EscrowRole } from "@/lib/crypto/escrow-ui";
import type { Deal, DealStage } from "@/lib/deals/types";
import { useEscrowPanel } from "./use-escrow-panel";
import { useWalletConnection } from "./use-wallet-connection";
import { WalletConnectBox } from "./wallet-connect-box";
import { WalletShell } from "./wallet-shell";

export namespace EscrowPanelViewTypes {
  export interface Props {
    deal: Deal;
    stage: DealStage;
    side: EscrowRole;
    config: PublicCryptoConfig;
    performerWallet: string | null;
    onChanged: () => void;
  }
}

const AddressRow = ({ label, value }: { label: string; value: string }) => (
  <div className="text-xs leading-snug">
    <p className="text-ink-muted">{label}</p>
    <p className="break-all font-medium tabular-nums text-ink">{value}</p>
  </div>
);

/** Рядок комісії: ставка з контракту, «?» відкриває пояснення дотиком і клавіатурою. */
const FeeLine = ({ feeBps }: { feeBps: number | null }) => (
  <p className="flex items-center gap-1.5 text-xs text-ink">
    {feeLabel(feeBps)}
    {feeBps !== 0 && (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="icon" aria-label="Що входить у комісію">
            ?
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-w-64 text-sm">Комісію сервісу контракт бере зверху до ціни етапу. Виконавець отримує ціну повністю. Ставку читаємо прямо з контракту.</PopoverContent>
      </Popover>
    )}
  </p>
);

const Inner = ({ deal, stage, side, config, performerWallet, onChanged }: EscrowPanelViewTypes.Props) => {
  const wallet = useWalletConnection(config.chainId);
  const panel = useEscrowPanel({ deal, stage, side, crypto: config, performerWallet, onChanged });
  const id = `escrow-${stage.id}`;
  const { buttons } = panel;
  const any = buttons.deposit || buttons.deliver || buttons.release || buttons.dispute || buttons.settle !== null;
  return (
    <div className="grid gap-3">
      <WalletConnectBox wallet={wallet} networkName={chainById(config.chainId).name} />
      {panel.ready && panel.wrongWallet && (
        <p role="alert" className="auth-error">
          {side === "performer" ? "Підключено не той гаманець: потрібен гаманець виконавця з угоди." : "Підключено не той гаманець: потрібен той, з якого внесено кошти."}
        </p>
      )}
      {panel.ready && !panel.wrongWallet && any && (
        <>
          {panel.buttons.deposit && (
            <>
              {performerWallet && <AddressRow label="Гаманець виконавця" value={performerWallet} />}
              {config.factory && <AddressRow label="Контракт-фабрика (створює окремий контракт на етап)" value={config.factory} />}
              <FeeLine feeBps={panel.feeBps} />
              <CheckboxField id={`${id}-verified`} checked={panel.verified} onCheckedChange={(value) => panel.setVerified(value === true)} label="Адреси на екрані гаманця (на пристрої) звірено з цими повністю" />
            </>
          )}
          {stage.escrow && !panel.buttons.deposit && <AddressRow label="Контракт етапу" value={stage.escrow.address} />}
          <div className="flex flex-wrap gap-2">
            {buttons.deposit && (
              <Button disabled={!panel.verified || panel.working} onClick={() => void panel.run("deposit")} className="w-auto">
                {panel.working && <Loader2 className="size-4 animate-spin" />}
                Внести {stage.amount} USDT в ескроу
              </Button>
            )}
            {buttons.deliver && (
              <Button disabled={panel.working} onClick={() => void panel.run("deliver")} className="w-auto">
                Здати етап
              </Button>
            )}
            {buttons.release && (
              <Button disabled={panel.working} onClick={() => void panel.run("release")} className="w-auto">
                Прийняти роботу
              </Button>
            )}
            {buttons.settle && (
              <Button disabled={panel.working} onClick={() => void panel.run("settle")} className="w-auto">
                {SETTLE_LABEL[buttons.settle]}
              </Button>
            )}
            {buttons.dispute && (
              <Button variant="secondary" disabled={panel.working} onClick={() => void panel.run("dispute")} className="w-auto">
                Відкрити спір
              </Button>
            )}
          </div>
        </>
      )}
      {panel.status && (
        <p role="status" className="pe-hint">
          {panel.status}
        </p>
      )}
      {panel.error && (
        <p role="alert" className="auth-error">
          {panel.error}
        </p>
      )}
      {panel.needsSync && (
        <Button variant="secondary" disabled={panel.working} onClick={() => void panel.resync()} className="w-auto">
          Звірити ще раз
        </Button>
      )}
    </div>
  );
};

const EscrowPanel = (props: EscrowPanelViewTypes.Props) => (
  <WalletShell config={props.config}>
    <Inner {...props} />
  </WalletShell>
);

export default EscrowPanel;
