import type { ReactNode } from "react";

/**
 * Екран «щось пішло не так»: картка по центру на темному тлі, як і решта
 * застосунку. Без хуків і провайдерів, щоб працювати навіть тоді, коли
 * впав сам кореневий layout (app/global-error.tsx).
 */
export function ProblemPage({ title, hint, action, children }: { title: string; hint: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <section className="glass-panel w-full max-w-[420px] rounded-[20px] p-7 text-center" role="alert" aria-live="assertive">
        <p aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-[22px] font-semibold text-accent-ink" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
          !
        </p>
        <h1 className="mt-4 text-[20px] font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{hint}</p>
        {children}
        <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>
      </section>
    </main>
  );
}
