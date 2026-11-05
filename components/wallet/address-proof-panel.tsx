"use client";

// components/wallet/address-proof-panel.tsx
//
// Кабінет виконавця: підключити гаманець і підтвердити його адресу підписом. Підпис не відправляє транзакцій і не
// дає доступу до коштів. Завантажується динамічно (див. wallet-address-section.tsx).

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { chainById } from "@/lib/crypto/chains";
import type { PublicCryptoConfig } from "@/lib/crypto/config";
import { useAddressProof } from "./use-address-proof";
import { useWalletConnection } from "./use-wallet-connection";
import { WalletConnectBox } from "./wallet-connect-box";
import { WalletShell } from "./wallet-shell";

const WHEN = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

const Inner = ({ config, onDone }: { config: PublicCryptoConfig; onDone: () => void }) => {
  const wallet = useWalletConnection(config.chainId);
  const proof = useAddressProof(wallet.address, onDone);
  return (
    <div className="grid gap-3">
      <WalletConnectBox wallet={wallet} networkName={chainById(config.chainId).name} />
      {wallet.connected && !wallet.wrongNetwork && (
        <Button disabled={proof.busy} onClick={() => void proof.confirm()} className="w-auto">
          {proof.busy && <Loader2 className="size-4 animate-spin" />}
          Підписати й підтвердити адресу
        </Button>
      )}
      {proof.error && (
        <p role="alert" className="auth-error">
          {proof.error}
        </p>
      )}
      {proof.result?.kind === "pending" && (
        <p role="status" className="pe-notice">
          Підпис прийнято. Адреса набуде чинності {WHEN.format(proof.result.effectiveAt)}, на пошту прийде лист. До того замовники її не бачать.
        </p>
      )}
      {proof.result?.kind === "unchanged" && (
        <p role="status" className="pe-notice">
          Ця адреса вже підтверджена.
        </p>
      )}
    </div>
  );
};

const AddressProofPanel = ({ config, onDone }: { config: PublicCryptoConfig; onDone: () => void }) => (
  <WalletShell config={config}>
    <Inner config={config} onDone={onDone} />
  </WalletShell>
);

export default AddressProofPanel;
