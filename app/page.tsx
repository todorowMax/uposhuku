// app/page.tsx
import { VibeGlobe } from "@/components/globe/vibe-globe";

/*
 * Поки що тільки глобус. Шапка, поле запиту й картки з макета ляжуть
 * поверх нього окремими блоками.
 */
export default function HomePage() {
  return (
    <main className="h-dvh w-full">
      <VibeGlobe />
    </main>
  );
}
