// lib/map/cities.ts
import type { City } from "./types";

/** Обласні центри й кілька великих міст. Координати центрів міст. */
export const CITIES: City[] = [
  { id: "kyiv", name: "Київ", lat: 50.4501, lng: 30.5234, label: true },
  { id: "lviv", name: "Львів", lat: 49.8397, lng: 24.0297, label: true, labelSide: "left" },
  { id: "kharkiv", name: "Харків", lat: 49.9935, lng: 36.2304, label: true },
  { id: "dnipro", name: "Дніпро", lat: 48.4647, lng: 35.0462, label: true },
  { id: "odesa", name: "Одеса", lat: 46.4825, lng: 30.7233, label: true, labelSide: "left" },
  { id: "zaporizhzhia", name: "Запоріжжя", lat: 47.8388, lng: 35.1396, label: false },
  { id: "vinnytsia", name: "Вінниця", lat: 49.2331, lng: 28.4682, label: false },
  { id: "poltava", name: "Полтава", lat: 49.5883, lng: 34.5514, label: false },
  { id: "chernihiv", name: "Чернігів", lat: 51.4982, lng: 31.2893, label: false },
  { id: "sumy", name: "Суми", lat: 50.9077, lng: 34.7981, label: false },
  { id: "zhytomyr", name: "Житомир", lat: 50.2547, lng: 28.6587, label: false },
  { id: "rivne", name: "Рівне", lat: 50.6199, lng: 26.2516, label: false },
  { id: "lutsk", name: "Луцьк", lat: 50.7472, lng: 25.3254, label: false },
  { id: "ternopil", name: "Тернопіль", lat: 49.5535, lng: 25.5948, label: false },
  { id: "ivano-frankivsk", name: "Івано-Франківськ", lat: 48.9226, lng: 24.7111, label: false },
  { id: "uzhhorod", name: "Ужгород", lat: 48.6208, lng: 22.2879, label: false },
  { id: "chernivtsi", name: "Чернівці", lat: 48.2921, lng: 25.9358, label: false },
  { id: "khmelnytskyi", name: "Хмельницький", lat: 49.4229, lng: 26.9871, label: false },
  { id: "cherkasy", name: "Черкаси", lat: 49.4444, lng: 32.0598, label: false },
  { id: "kropyvnytskyi", name: "Кропивницький", lat: 48.5079, lng: 32.2623, label: false },
  { id: "mykolaiv", name: "Миколаїв", lat: 46.975, lng: 31.9946, label: false },
  // Центр Херсона на самій набережній, а берег у Natural Earth узагальнений
  // до кілометра: точку зсунуто на пару кілометрів углиб міста.
  { id: "kherson", name: "Херсон", lat: 46.655, lng: 32.605, label: false },
  { id: "bila-tserkva", name: "Біла Церква", lat: 49.7968, lng: 30.1311, label: false },
  { id: "kremenchuk", name: "Кременчук", lat: 49.0659, lng: 33.4204, label: false },
];

export const cityById = (id: string): City => {
  const city = CITIES.find((candidate) => candidate.id === id);
  if (!city) throw new Error(`Немає міста ${id}`);
  return city;
};
