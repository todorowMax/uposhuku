import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useContactBar, type ContactBarTypes } from "@/components/profile/use-contact-bar";
import { SEND_ERROR_TEXTS } from "@/lib/chat/send-result";
import { CHAT_TEXT_MAX } from "@/lib/chat/types";

const setup = (outcome: ContactBarTypes.Outcome | Promise<ContactBarTypes.Outcome>) => {
  const onSend = vi.fn<(text: string) => Promise<ContactBarTypes.Outcome>>(() => Promise.resolve(outcome));
  const onStart = vi.fn();
  const hook = renderHook(() => useContactBar({ onStart, onSend }));
  return { ...hook, onSend, onStart };
};

describe("рядок задачі в профілі виконавця", () => {
  it("кнопка стає полем, хрестик повертає кнопку й нічого не закриває", () => {
    const { result, onStart } = setup({ ok: true });
    expect(result.current.mode).toBe("idle");
    act(() => result.current.open());
    expect(result.current.mode).toBe("compose");
    expect(onStart).toHaveBeenCalledTimes(1);
    act(() => result.current.cancel());
    expect(result.current.mode).toBe("idle");
  });

  it("надсилає обрізаний текст, а порожній чи пробіли ні", async () => {
    const { result, onSend } = setup({ ok: true });
    act(() => result.current.open());
    act(() => result.current.type("   "));
    expect(result.current.canSend).toBe(false);
    await act(() => result.current.submit());
    expect(onSend).not.toHaveBeenCalled();
    act(() => result.current.type("  Потрібен лендинг  "));
    await act(() => result.current.submit());
    expect(onSend).toHaveBeenCalledWith("Потрібен лендинг");
  });

  it("при відмові текст лишається, а причина видна; 429 і інше кажуть різне", async () => {
    const limited = setup({ ok: false, status: 429 });
    act(() => limited.result.current.type("Текст"));
    await act(() => limited.result.current.submit());
    expect(limited.result.current.draft).toBe("Текст");
    expect(limited.result.current.error).toBe(SEND_ERROR_TEXTS.rateLimit);
    act(() => limited.result.current.type("Текст ще"));
    expect(limited.result.current.error).toBeNull();

    const other = setup({ ok: false, status: null });
    act(() => other.result.current.type("Текст"));
    await act(() => other.result.current.submit());
    expect(other.result.current.error).toBe(SEND_ERROR_TEXTS.generic);
  });

  it("гостя відправляють входити: помилки немає, текст у полі", async () => {
    const { result } = setup("login");
    act(() => result.current.type("Текст"));
    await act(() => result.current.submit());
    expect(result.current.error).toBeNull();
    expect(result.current.draft).toBe("Текст");
  });

  it("другий Enter, поки іде відправка, повторно не шле", async () => {
    let finish: (outcome: ContactBarTypes.Outcome) => void = () => undefined;
    const pending = new Promise<ContactBarTypes.Outcome>((resolve) => {
      finish = resolve;
    });
    const { result, onSend } = setup(pending);
    act(() => result.current.type("Текст"));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.submit();
      void result.current.submit();
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ ok: true });
      await first;
    });
  });

  it("задовгий текст не надсилається", () => {
    const { result } = setup({ ok: true });
    act(() => result.current.type("а".repeat(CHAT_TEXT_MAX + 1)));
    expect(result.current.limit.over).toBe(true);
    expect(result.current.canSend).toBe(false);
  });
});
