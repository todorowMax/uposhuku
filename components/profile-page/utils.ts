// Дрібні форматери сторінки профілю: відмінок слова «відгук», дата, ініціали.

const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Kyiv" });

export const formatDate = (iso: string): string => DATE.format(new Date(iso));

export const reviewsWord = (count: number): string => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return "відгук";
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return "відгуки";
  return "відгуків";
};

/** До двох перших літер імені великими: для кружка без фото. */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
