"use client";

// kit/telemetry/client/page-views.tsx
//
// У застосунку переходи клієнтські: сторінка завантажується один раз, далі
// міняється лише адреса. Стежимо за маршрутом і шлемо перегляд самі, інакше
// вся статистика складалася б із першого екрана.

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { trackPage } from "./analytics";

function PageViewsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const last = useRef<string | null>(null);

  useEffect(() => {
    const query = searchParams.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    // У строгому режимі React проганяє ефекти двічі: без цієї перевірки кожен перегляд рахувався б за два.
    if (last.current === path) return;
    last.current = path;
    trackPage(path);
  }, [pathname, searchParams]);

  return null;
}

/** `useSearchParams` вимагає Suspense, інакше вся сторінка стає динамічною. */
export function PageViews() {
  return (
    <Suspense fallback={null}>
      <PageViewsInner />
    </Suspense>
  );
}
