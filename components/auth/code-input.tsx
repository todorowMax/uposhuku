"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

/**
 * Шість комірок для коду з листа, як в ukoshiku. Масив, а не рядок: коли
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
  useImperativeHandle(ref, () => ({ focus: () => focusCell(Math.max(0, Math.min(digits.findIndex((digit) => !digit), 5))) }));

  const write = (value: string, startAt: number) => {
    const inserted = value.replace(/\D/g, "").slice(0, 6 - startAt);
    const next = [...digits];
    if (!inserted) next[startAt] = "";
    for (const [offset, digit] of [...inserted].entries()) next[startAt + offset] = digit;
    onChange(next);
    if (inserted) focusCell(Math.min(startAt + inserted.length, 5));
  };

  return (
    <div className="code-input" role="group" aria-label="Код з листа, 6 цифр" data-invalid={invalid || undefined}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            cells.current[index] = element;
          }}
          aria-label={`Цифра ${index + 1}`}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={6}
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
            if (event.key === "ArrowRight" && index < 5) {
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
          data-gap={index === 3 || undefined}
        />
      ))}
    </div>
  );
});
