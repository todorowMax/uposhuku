// components/chat/inbox/parts/message-text.tsx
//
// Текст повідомлення з клікабельними посиланнями. Розбір у `lib/chat/links.ts` (лише http і https), тут кожен
// шматок стає текстом чи елементом `<a>`: без `dangerouslySetInnerHTML`. Зовнішнє посилання відкривається в новій
// вкладці без `opener` і без передачі ваги пошуковикам.

import { useMemo } from "react";
import { splitLinks } from "@/lib/chat/links";

export const MessageText = ({ text }: { text: string }) => {
  const parts = useMemo(() => splitLinks(text), [text]);
  return (
    <p>
      {parts.map((part, index) =>
        part.type === "link" ? (
          <a key={index} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="dm-link">
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </p>
  );
};
