// lib/ui/layer-stack.ts
//
// Чиста логіка стека шарів (екран, шторка) і запису в історії браузера. Кожен відкритий шар кладе один запис,
// щоб системна кнопка «назад» закривала верхній шар, а не йшла зі сторінки. Ефекти (pushState, go) у
// `use-layer-history.ts`, тут лише рішення.
//
// Шар, закритий не зверху (нижній закрили кодом, верхній ще відкритий), лишає в історії «привида»: запис
// не прибрати з середини. Привид зникає, щойно його звільнить верхній шар.

export namespace LayerStackTypes {
  export type Layer = { readonly id: string; readonly live: boolean };
  export type Stack = readonly Layer[];
  /** Що зробити з історією: `push` один запис; `go` назад на стільки записів (одним переходом). */
  export type Open = { readonly stack: Stack; readonly push: boolean };
  export type Close = { readonly stack: Stack; readonly go: number };
  /** Системне «назад»: який шар закрити і на скільки записів ще піти назад, щоб прибрати привидів. */
  export type Pop = { readonly stack: Stack; readonly close: string | null; readonly extra: number };
}

export const emptyStack: LayerStackTypes.Stack = [];

export const openLayer = (stack: LayerStackTypes.Stack, id: string): LayerStackTypes.Open => {
  if (stack.some((layer) => layer.id === id && layer.live)) return { stack, push: false };
  return { stack: [...stack, { id, live: true }], push: true };
};

/** Привидів безпосередньо під вершиною, їх кількість. */
const ghostsBelow = (stack: LayerStackTypes.Stack, top: number): number => {
  let count = 0;
  while (top - count > 0 && !stack[top - count - 1].live) count += 1;
  return count;
};

export const closeLayer = (stack: LayerStackTypes.Stack, id: string): LayerStackTypes.Close => {
  const index = stack.findIndex((layer) => layer.id === id && layer.live);
  if (index < 0) return { stack, go: 0 };
  if (index !== stack.length - 1) return { stack: stack.map((layer, i) => (i === index ? { ...layer, live: false } : layer)), go: 0 };
  const keep = index - ghostsBelow(stack, index);
  return { stack: stack.slice(0, keep), go: stack.length - keep };
};

export const popLayer = (stack: LayerStackTypes.Stack): LayerStackTypes.Pop => {
  if (stack.length === 0) return { stack, close: null, extra: 0 };
  const top = stack.length - 1;
  const rest = stack.slice(0, top);
  if (!stack[top].live) return { stack: rest, close: null, extra: 0 };
  const extra = ghostsBelow(stack, top);
  return { stack: rest.slice(0, rest.length - extra), close: stack[top].id, extra };
};

/** Верхній живий шар: його запис має бути поточним в історії, перш ніж ми підемо назад. */
export const topLayerId = (stack: LayerStackTypes.Stack): string | null => stack.at(-1)?.id ?? null;
