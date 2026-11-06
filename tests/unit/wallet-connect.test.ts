import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECT_TIMEOUT_MS, injectedMissing, isWalletCancelled, isWalletTimeout, withTimeout } from "@/lib/crypto/wallet-connect";
import { walletErrorText } from "@/lib/crypto/wallet-errors";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("підключення гаманця не висить вічно", () => {
  it("гаманець, що не відповідає, дає помилку за часом, а не нескінченне очікування", async () => {
    const result = withTimeout(new Promise<never>(() => undefined), CONNECT_TIMEOUT_MS);
    const caught = result.catch((reason: unknown) => reason);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    const reason = await caught;
    expect(isWalletTimeout(reason)).toBe(true);
    expect(walletErrorText(reason)).toContain("не відповів");
  });

  it("швидка відповідь проходить без змін", async () => {
    await expect(withTimeout(Promise.resolve("ok"), CONNECT_TIMEOUT_MS)).resolves.toBe("ok");
  });

  it("людина може скасувати підключення: це окрема причина, не помилка гаманця", async () => {
    const abort = new AbortController();
    const caught = withTimeout(new Promise<never>(() => undefined), CONNECT_TIMEOUT_MS, abort.signal).catch((reason: unknown) => reason);
    abort.abort();
    expect(isWalletCancelled(await caught)).toBe(true);
  });

  it("injected без розширення «не знайдено», решта коннекторів мають власний шлях", () => {
    expect(injectedMissing("injected", false)).toBe(true);
    expect(injectedMissing("injected", true)).toBe(false);
    expect(injectedMissing("metaMask", false)).toBe(false);
    expect(injectedMissing("walletConnect", false)).toBe(false);
  });
});
