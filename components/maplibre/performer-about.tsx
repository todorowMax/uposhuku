"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight } from "@/components/icons";
import { gsap } from "gsap";
import type { Performer, PortfolioWork } from "@/lib/map/types";

/**
 * «Про себе» і роботи в картці виконавця. Опис — три рядки, далі
 * «Розгорнути»; роботи — горизонтальна стрічка. Картка перемонтовується
 * для кожної людини (key), тож і розгорнутість скидається сама.
 */
export function PerformerAbout({ performer, onOpenWork, full = false }: { performer: Performer; onOpenWork: (work: PortfolioWork) => void; full?: boolean }) {
  const bioRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const [expanded, setExpanded] = useState(false);
  /** Відкрита робота: її опис і посилання під стрічкою. */
  const [openId, setOpenId] = useState<string | null>(null);
  const open = performer.works.find((work) => work.id === openId);
  const [tagLabels, setTagLabels] = useState<Record<string, string>>({});
  /** Чи довший текст за три рядки: інакше кнопка не потрібна. */
  const [clamped, setClamped] = useState(false);
  const heightBefore = useRef<number | null>(null);

  useLayoutEffect(() => {
    const text = textRef.current;
    if (text && !expanded) setClamped(text.scrollHeight > text.clientHeight + 1);
  }, [performer.bio, expanded]);

  // Розгортання й згортання плавні: висота їде від старої до нової.
  useLayoutEffect(() => {
    const box = bioRef.current;
    const from = heightBefore.current;
    heightBefore.current = null;
    if (!box || from === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(box, { height: from }, { height: box.offsetHeight, duration: 0.28, ease: "power2.out", clearProps: "height" });
    return () => {
      tween.kill();
    };
  }, [expanded]);

  // Коліщатко миші гортає стрічку вбік: інакше без тачпада до останніх робіт не дістатися.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = strip.scrollWidth - strip.clientWidth;
      if (max <= 0) return;
      const next = strip.scrollLeft + event.deltaY;
      // На краю стрічки віддаємо прокрутку картці.
      if ((next <= 0 && strip.scrollLeft <= 0) || (next >= max && strip.scrollLeft >= max)) return;
      event.preventDefault();
      strip.scrollLeft = next;
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, []);

  // Назви тегів роботи беремо зі словника, коли він підвантажився.
  useEffect(() => {
    if (!open?.tags?.length) return;
    let cancelled = false;
    void import("@/lib/tags/engine").then((engine) => {
      if (!cancelled) setTagLabels(Object.fromEntries(open.tags!.map((id) => [id, engine.tagLabel(id)])));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const pickWork = (work: PortfolioWork) => {
    if (work.description || work.url) setOpenId((current) => (current === work.id ? null : work.id));
    else onOpenWork(work);
  };

  const toggle = () => {
    heightBefore.current = bioRef.current?.offsetHeight ?? null;
    setExpanded((value) => !value);
  };

  return (
    <>
      <div className="mt-4">
        <p className="text-[12px] font-semibold text-ink">Про себе</p>
        <div ref={bioRef} className="overflow-hidden">
          <p ref={textRef} className={`mt-1 text-[13px] leading-[1.5] text-ink/85 ${expanded || full ? "" : "line-clamp-3"}`}>
            {performer.bio}
          </p>
        </div>
        {clamped && !full && (
          <button type="button" onClick={toggle} aria-expanded={expanded} className="mt-1 text-[12px] font-medium text-ink-muted underline decoration-[#b8c4c7] underline-offset-4 transition-colors hover:text-ink hover:decoration-ink-muted">
            {expanded ? "Згорнути" : "Розгорнути"}
          </button>
        )}
      </div>

      {performer.works.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-semibold text-ink">
            Роботи <span className="font-normal text-ink-muted">· {performer.works.length}</span>
          </p>
          <ul ref={stripRef} className={full ? "works-grid" : "works-strip"} aria-label={`Роботи: ${performer.works.length}`}>
            {performer.works.map((work) => (
              <li key={work.id}>
                <button type="button" className="work-tile" aria-pressed={work.id === openId} onClick={() => pickWork(work)}>
                  <WorkThumb work={work} />
                  <span className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-snug text-ink">{work.title}</span>
                </button>
              </li>
            ))}
          </ul>
          {open && (
            <div className="work-detail">
              <p className="text-[13px] font-semibold text-ink">{open.title}</p>
              {open.description && <p className="mt-1 text-[12px] leading-snug text-ink/85">{open.description}</p>}
              {Boolean(open.tags?.length) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {open.tags!.map((id) => (
                    <span key={id} className="auth-draft-tag">
                      {tagLabels[id] ?? id}
                    </span>
                  ))}
                </div>
              )}
              {open.url && (
                <a href={open.url} target="_blank" rel="noopener noreferrer nofollow" className="auth-link mt-2 inline-flex items-center gap-1 text-[12px]">
                  Відкрити проєкт
                  <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Мініатюра роботи, поки немає справжніх скриншотів: умовний екран за типом
 * проєкту на кольоровому тлі, без підписів.
 */
function WorkThumb({ work }: { work: PortfolioWork }) {
  return (
    <span aria-hidden className="work-thumb" data-kind={work.kind} style={{ "--h": work.hue } as React.CSSProperties}>
      {work.kind === "site" && (
        <span className="work-window">
          <span className="work-dots" />
          <span className="work-hero" />
          <span className="work-line w-4/5" />
          <span className="work-line w-3/5" />
        </span>
      )}
      {work.kind === "dashboard" && (
        <span className="work-window work-window-row">
          <span className="work-sidebar" />
          <span className="work-bars">
            {[55, 80, 40, 95, 65].map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </span>
        </span>
      )}
      {work.kind === "app" && (
        <span className="work-phone">
          <span className="work-hero" />
          <span className="work-line w-4/5" />
          <span className="work-line w-3/5" />
          <span className="work-pill" />
        </span>
      )}
      {work.kind === "bot" && (
        <span className="work-chat">
          <span className="work-bubble" />
          <span className="work-bubble work-bubble-own" />
          <span className="work-bubble w-3/5" />
        </span>
      )}
      {work.kind === "design" && (
        <span className="work-swatches">
          <span className="work-aa">Aa</span>
          <span className="work-swatch-row">
            <span />
            <span />
            <span />
          </span>
        </span>
      )}
    </span>
  );
}
