"use client";

// components/wallet/wallet-connect-box.tsx
//
// Підключення гаманця: свої кнопки зі списком гаманців, QR для WalletConnect (холодні гаманці підключаються через
// нього або через MetaMask), стан мережі й відключення. Готових модальних вікон не використовуємо.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { QrImage } from "@/components/deals/qr-image";
import type { WalletConnection } from "./use-wallet-connection";

export const WalletConnectBox = ({ wallet, networkName }: { wallet: WalletConnection; networkName: string }) => (
  <div className="grid gap-2">
    {!wallet.connected && (
      <>
        <p className="pe-hint">Оберіть гаманець. Холодні гаманці (Ledger, Trezor) підключайте через MetaMask чи WalletConnect: підтверджувати доведеться на пристрої.</p>
        <ul className="grid gap-2" aria-label="Гаманці">
          {wallet.connectors.map((item) => (
            <li key={item.id}>
              <Button variant="secondary" disabled={wallet.busy !== null} onClick={() => void wallet.connectWith(item.id)} className="w-full justify-start">
                {wallet.busy === item.id && <Loader2 className="size-4 animate-spin" />}
                {item.name}
              </Button>
            </li>
          ))}
        </ul>
        {wallet.pairingUri && <QrImage value={wallet.pairingUri} label="QR-код для підключення гаманця через WalletConnect" />}
      </>
    )}
    {wallet.connected && wallet.address && (
      <div className="grid gap-2">
        <p className="text-xs text-ink-muted">
          Підключено: <span className="break-all font-medium tabular-nums text-ink">{wallet.address}</span>
        </p>
        {wallet.wrongNetwork && (
          <div className="grid gap-2">
            <p role="alert" className="auth-error">
              Гаманець у іншій мережі. Потрібна: {networkName}.
            </p>
            <Button variant="secondary" disabled={wallet.busy !== null} onClick={() => void wallet.switchNetwork()} className="w-auto">
              {wallet.busy === "switch" && <Loader2 className="size-4 animate-spin" />}
              Переключити мережу
            </Button>
          </div>
        )}
        <Button variant="link" disabled={wallet.busy !== null} onClick={() => void wallet.leave()} className="w-auto py-1 text-xs">
          Відʼєднати гаманець
        </Button>
      </div>
    )}
    {wallet.error && (
      <p role="alert" className="auth-error">
        {wallet.error}
      </p>
    )}
  </div>
);
