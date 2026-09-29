// app/page.tsx
import { RequestComposer } from "@/components/composer/request-composer";
import { VibeGlobe } from "@/components/globe/vibe-globe";

/*
 * Глобус на весь екран і поле запиту над ним. Шапка й картки запиту та
 * виконавця з макета ляжуть окремими блоками.
 */
export default function HomePage() {
  return (
    <main className="relative h-dvh w-full">
      <VibeGlobe />
      <RequestComposer />
    </main>
  );
}
