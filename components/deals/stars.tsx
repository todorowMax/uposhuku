import { Star } from "@/components/icons";

/** Оцінка зірками: лише показ, без вибору. */
export const Stars = ({ value, size = 14 }: { value: number; size?: number }) => (
  <span className="inline-flex gap-0.5" role="img" aria-label={`${value} з 5`}>
    {[1, 2, 3, 4, 5].map((index) => (
      <Star key={index} width={size} height={size} className={index <= Math.round(value) ? "fill-brand text-brand" : "text-line"} />
    ))}
  </span>
);
