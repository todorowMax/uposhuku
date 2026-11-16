// lib/maplibre/carousel.ts
//
// Чиста логіка горизонтальної каруселі карток: яка картка активна за прокруткою.

/** Індекс картки, що стоїть у центрі: прокрутка ділиться на крок (ширина картки з проміжком) і обмежується кількістю. */
export const activeSlide = ({ scrollLeft, step, count }: { scrollLeft: number; step: number; count: number }): number => {
  if (count <= 0 || step <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / step)));
};
