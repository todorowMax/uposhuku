// lib/crypto/wallet-connect.ts
//
// Підключення гаманця не має висіти вічно: ліміт часу й скасування людиною. Чисті функції без wagmi.

/** Скільки чекаємо відповіді гаманця: вистачає, щоб відсканувати QR, але не вічність. */
export const CONNECT_TIMEOUT_MS = 60_000;

const named = (name: string, message: string): Error => Object.assign(new Error(message), { name });

/** Гаманець не відповів за відведений час. */
export const isWalletTimeout = (error: unknown): boolean => (error as { name?: string } | null)?.name === "WalletTimeoutError";

/** Людина сама скасувала підключення: це не помилка, показувати нічого не треба. */
export const isWalletCancelled = (error: unknown): boolean => (error as { name?: string } | null)?.name === "WalletCancelledError";

/** Гаманця-розширення в браузері немає: підключатися нікуди. Лише для injected, інші коннектори мають власний шлях. */
export const injectedMissing = (connectorType: string, hasInjectedProvider: boolean): boolean => connectorType === "injected" && !hasInjectedProvider;

/** Завдання або відповідь, або помилка за часом чи за сигналом скасування. Саме завдання зупинити не можна: його результат викидаємо. */
export const withTimeout = <T>(task: Promise<T>, ms: number, abort?: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(named("WalletTimeoutError", "Гаманець не відповів.")), ms);
    const onAbort = () => reject(named("WalletCancelledError", "Підключення скасовано."));
    if (abort?.aborted) onAbort();
    abort?.addEventListener("abort", onAbort, { once: true });
    task.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      abort?.removeEventListener("abort", onAbort);
    });
  });
