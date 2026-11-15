// lib/maplibre/stack-edges.ts
//
// Між чим стоять панелі над картою: зверху поле запиту, картка запиту й фільтри, знизу кнопки.
// Читає DOM, тому викликається лише з ефектів і обробників.

/**
 * Нижче чого панель над картою не заходить зверху: поле запиту, картка
 * запиту й фільтри — лише якщо вона під ними по ширині.
 */
export const topEdgeUnderStack = (bounds: DOMRect, left: number, width: number) => {
  let edge = 104;
  for (const item of document.querySelector("[data-top-stack]")?.children ?? []) {
    const box = item.getBoundingClientRect();
    if (box.height && box.right - bounds.left > left && box.left - bounds.left < left + width) {
      edge = Math.max(edge, box.bottom - bounds.top + 12);
    }
  }
  return edge;
};

/** Нижня межа картки: над нижніми кнопками, якщо картка стоїть над ними, інакше відступ від краю. */
export const bottomEdgeAboveControls = (bounds: DOMRect, left: number, width: number) => {
  const box = document.querySelector(".bottom-controls")?.getBoundingClientRect();
  const overlaps = box && box.right - bounds.left > left && box.left - bounds.left < left + width;
  return overlaps ? box.top - bounds.top - 12 : bounds.height - 16;
};
