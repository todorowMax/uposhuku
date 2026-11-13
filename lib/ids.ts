// lib/ids.ts
//
// Ідентифікатори нових сутностей: префікс і 16 hex-символів (64 біти випадковості). Старі, 8-символьні
// (`deal_1a2b3c4d`), лишаються як є: їх ніхто не перераховує, тож розбирати id за довжиною не можна.

const BYTES = 8;

/** Новий id: `<префікс>_<16 hex>`, випадкові байти з Web Crypto. */
export const newId = (prefix: string): string => `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(BYTES)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
