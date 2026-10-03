// lib/chat/contacts.ts
//
// Контакти поза чатом не блокуємо, а попереджаємо (вирішено в плані): номер
// телефону, @нік, посилання на месенджери.

export const mentionsContacts = (text: string) =>
  /(\+?\d[\d\s\-()]{8,}\d)|(^|\s)@[a-z0-9_]{4,}|t\.me\/|wa\.me\/|viber|telegram|телеграм|вайбер|whatsapp|ватсап/i.test(text);
