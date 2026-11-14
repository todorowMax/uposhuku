// lib/ui/sheet-swipe.ts
//
// Чисті рішення для жесту «свайп вниз» на шторці. DOM і події в `use-sheet-swipe.ts`.

/** Мінімальний зсув пальця, після якого жест вважаємо перетягуванням, а не дотиком. */
export const DRAG_START_PX = 8;
/** Швидкість (px/мс), з якої короткий змах закриває шторку. */
export const FLICK_SPEED = 0.5;
/** Частка висоти шторки, після якої відпущена шторка закривається. */
export const DISMISS_RATIO = 0.35;

/** Шторка тягнеться лише вниз і лише коли рух переважно вертикальний. */
export const startsDrag = (dx: number, dy: number): boolean => dy > DRAG_START_PX && dy > Math.abs(dx);

/** Зсув шторки за пальцем: вгору не тягнемо. */
export const dragOffset = (dy: number): number => Math.max(0, dy);

/** Закрити відпущену шторку: далеко потягли або швидко змахнули вниз. */
export const shouldDismiss = (dy: number, durationMs: number, height: number): boolean => {
  if (dy <= 0 || height <= 0) return false;
  const speed = dy / Math.max(1, durationMs);
  return dy >= height * DISMISS_RATIO || (speed >= FLICK_SPEED && dy > DRAG_START_PX * 2);
};

export interface SwipeStart {
  /** Скільки пальців на екрані: жест лише одним. */
  touches: number;
  /** Екран завширокий для шторки: це вікно чи колонка, свайпу немає. */
  wide: boolean;
  /** Дотик почався в полі вводу: палець там виділяє текст і ставить курсор. */
  textField: boolean;
  /** Дотик почався всередині вмісту, прокрученого від верху: свайп вниз тут гортає список. */
  scrolled: boolean;
}

/** Чи може дотик стати свайпом шторки. Інакше жест не чіпаємо, а прокрутка й поля працюють як завжди. */
export const canStartSwipe = ({ touches, wide, textField, scrolled }: SwipeStart): boolean => touches === 1 && !wide && !textField && !scrolled;
