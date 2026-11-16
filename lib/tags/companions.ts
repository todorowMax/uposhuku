// lib/tags/companions.ts
//
// Матриця супутників: які теги зазвичай потрібні разом із даним.
// Згенерована в кілька проходів із зовнішнім рев'ю (TookenClub) і
// перевірена на синтетичних запитах; вага 0.3–0.9 — наскільки ймовірно.
// Дані лежать у companions.json поруч (правити можна руками): tests/unit/tags.test.ts стежить за посиланнями.

import data from "./companions.json";

export const COMPANIONS: Record<string, Record<string, number>> = data;
