// lib/phone/codes.ts
//
// Стабільний код відмови 409, спільний для сервера (lib/server/phone-gate.ts) і браузера.

/** Замовнику потрібен підтверджений телефон: публікувати запити й домовлятися про угоди можна після нього. */
export const PHONE_REQUIRED_CODE = "phone_required";

export const PHONE_REQUIRED_DETAIL = "Підтвердіть телефон, щоб публікувати запити й домовлятися про угоди.";
