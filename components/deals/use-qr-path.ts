"use client";

// components/deals/use-qr-path.ts
//
// Будує шлях SVG для QR. Бібліотека `uqr` підвантажується динамічно, лише коли картка переказу показана.

import { useEffect, useState } from "react";
import { qrPath } from "@/lib/deals/qr-path";

export const useQrPath = (value: string | null) => {
  const [qr, setQr] = useState<{ value: string; d: string; size: number } | null>(null);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    void import("uqr").then(({ encode }) => {
      const { data, size } = encode(value, { ecc: "M", border: 0 });
      if (!cancelled) setQr({ value, d: qrPath(data), size });
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return qr && qr.value === value ? qr : null;
};
