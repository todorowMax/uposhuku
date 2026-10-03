"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

/**
 * Комірки для коду (6 з листа, у тестовому режимі скільки в коді доступу), як в ukoshiku. Масив, а не рядок: коли
 * стираєш третю цифру, наступні не «підстрибують» ліворуч у чужі комірки.
 * Вставка з буфера й автозаповнення з SMS/пошти розкладаються по комірках.
 */
export const CodeInput = forwardRef<
  { focus: () => void },
  { digits: string[]; onChange: (digits: string[]) => void; disabled?: boolean; invalid?: boolean }
>(function CodeInput({ digits, onChange, disabled, invalid }, ref) {
  const cells = useRef<Array<HTMLInputElement | null>>([]);
  const focusCell = (index: number) => {
    cells.current[index]?.focus();
    cells.current[index]?.select();
  };
  useImperativeHandle(ref, () => ({ focus: () => focusCell(Math.max(0, Math.min(digits.findIndex((digit) => !digit), digits.length - 1))) }));

  const write = (value: string, startAt: number) => {
    const inserted = value.replace(/\D/g, "").slice(0, digits.length - startAt);
    const next = [...digits];
    if (!inserted) next[startAt] = "";
    for (const [offset, digit] of [...inserted].entries()) next[startAt + offset] = digit;
    onChange(next);
    if (inserted) focusCell(Math.min(startAt + inserted.length, digits.length - 1));
  };

  return (
    <div className="code-input" role="group" aria-label={`Код, ${digits.length} цифр`} data-invalid={invalid || undefined}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            cells.current[index] = element;
          }}
          aria-label={`Цифра ${index + 1}`}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={digits.length}
          pattern="[0-9]*"
          disabled={disabled}
          value={digit}
          onChange={(event) => write(event.target.value, index)}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digit && index > 0) {
              event.preventDefault();
              const next = [...digits];
              next[index - 1] = "";
              onChange(next);
              focusCell(index - 1);
            }
            if (event.key === "ArrowLeft" && index > 0) {
              event.preventDefault();
              focusCell(index - 1);
            }
            if (event.key === "ArrowRight" && index < digits.length - 1) {
              event.preventDefault();
              focusCell(index + 1);
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            write(event.clipboardData.getData("text"), index);
          }}
          onFocus={(event) => event.currentTarget.select()}
          className="code-cell"
          data-gap={(digits.length === 6 && index === 3) || undefined}
        />
      ))}
    </div>
  );
});
