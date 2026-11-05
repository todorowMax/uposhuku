// lib/crypto/deal-ref.ts
//
// Посилання на етап угоди в контрактах (bytes32 dealRef): хеш від id угоди й етапу. Сервер вираховує його сам
// і звіряє з подією контракту, тож чужу транзакцію до цього етапу не прив'язати.

import { keccak256, toBytes, type Hex } from "viem";

export const dealRefOf = (dealId: string, stageId: string): Hex => keccak256(toBytes(`${dealId}:${stageId}`));
