"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { isImageFile } from "@/lib/images/decode";
import { resizeToSquareJpegDataUrl } from "@/lib/images/resize";

/** Відсікаємо заздалегідь неосяжне: RAW, панорами, знімки екрана 8K. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/**
 * Фото профілю: кружечок, як на карті. Стискаємо в браузері до відправки
 * (код з ukoshiku), HEIC з айфона теж читається.
 */
export function PhotoField({ value, name, onChange }: { value: string; name: string; onChange: (dataUrl: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setError(null);
    if (file.size > MAX_SOURCE_BYTES) {
      setError("Фото завелике, оберіть інше.");
      return;
    }
    if (!(await isImageFile(file))) {
      setError("Це не схоже на фото. Підійде JPEG, PNG, WebP чи знімок з айфона.");
      return;
    }
    setBusy(true);
    try {
      onChange(await resizeToSquareJpegDataUrl(file));
    } catch {
      setError("Не вдалося прочитати фото. Спробуйте інше.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={value ? "Змінити фото" : "Додати фото"}
          className="pe-photo"
          data-empty={!value || undefined}
          style={value ? { backgroundImage: `url(${value})` } : undefined}
        >
          {!value && (busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" strokeWidth={1.6} />)}
          {!value && !busy && <span className="sr-only">{name || "Фото"}</span>}
        </button>
        {value && (
          <span className="pe-photo-badge" aria-hidden>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" strokeWidth={2} />}
          </span>
        )}
      </div>
      <div className="min-w-0 text-[12px] leading-relaxed text-ink-muted">
        <p>Справжнє фото обличчя: так вам довіряють. Кадруємо по центру в коло.</p>
        {value && (
          <button type="button" onClick={() => onChange("")} className="auth-link mt-1 inline-flex items-center gap-1 text-[12px]">
            <Trash2 className="size-3.5" strokeWidth={1.9} />
            Прибрати фото
          </button>
        )}
        {error && (
          <p role="alert" className="auth-error mt-1">
            {error}
          </p>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => event.target.files?.[0] && void pick(event.target.files[0])} />
    </div>
  );
}
