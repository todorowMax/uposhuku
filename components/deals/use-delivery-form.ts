"use client";

// components/deals/use-delivery-form.ts
//
// Поля «здати етап»: пояснення й посилання на результат. Перевіряємо тим самим правилом, що й сервер.

import { useState } from "react";
import { checkDelivery } from "@/lib/deals/dispute-aids";

export const useDeliveryForm = (onSubmit: (fields: { deliveryText: string; deliveryLink: string }) => Promise<void>) => {
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const checked = checkDelivery(text, link);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    await onSubmit({ deliveryText: text.trim(), deliveryLink: link.trim() });
  };

  return { text, setText, link, setLink, error, submit };
};
