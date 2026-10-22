"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Plus } from "@/components/icons";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { loadTagEngine } from "@/lib/tags/use-tagging";
import type { ProposeOutcome } from "@/lib/tags/proposals-client";
import { trackPickerOpened, trackSearchEmpty, trackTagPicked, type TagContext } from "@/lib/telemetry/tag-events";
import { useMediaQuery } from "@/lib/ui/use-media-query";

type TagEngine = Awaited<ReturnType<typeof loadTagEngine>>;

export type TagPickerContext = TagContext;

export interface TagPickerProps {
  /** Теги, що вже вибрані: з галочкою. */
  selected: readonly string[];
  /** Серед вибраних ті, що знайдені в тексті: зняти їх означає сховати тег. */
  auto?: ReadonlySet<string>;
  /** Сірі пропозиції, найімовірніші першими: показуємо, поки запит порожній. */
  suggestions?: readonly string[];
  labelOf: (id: string) => string;
  /** Додати або прибрати тег. `false`, коли ліміт вичерпано. */
  onToggle: (tagId: string) => boolean;
  /** Ручних тегів уже максимум: нові не додаються, вибрані можна знімати. */
  limitReached?: boolean;
  limitHint?: string;
  context: TagPickerContext;
  /** Кнопка, що відкриває вибір. Типова: чип «+ Додати тег». */
  trigger?: ReactNode;
  /** Без випадайки: панель стоїть прямо на сторінці (фільтри карти). */
  inline?: boolean;
  /** «Запропонувати „…“», коли нічого не знайшлося. Немає: кнопки в пікері теж немає (гість). */
  onPropose?: (text: string) => Promise<ProposeOutcome>;
  title?: string;
}

/** Скільки тегів групи показуємо, поки її не розгорнули: 535 рядків одразу гальмують телефон. */
const GROUP_PREVIEW = 8;
const SEARCH_LIMIT = 30;
const MIN_QUERY = 2;

const highlight = (label: string, query: string): ReactNode => {
  const needle = query.trim().toLowerCase();
  const at = needle ? label.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return label;
  return (
    <>
      {label.slice(0, at)}
      <b>{label.slice(at, at + needle.length)}</b>
      {label.slice(at + needle.length)}
    </>
  );
};

function TagPickerPanel({ selected, auto, suggestions = [], labelOf, onToggle, limitReached, limitHint, onPropose, context }: TagPickerProps) {
  const [engine, setEngine] = useState<TagEngine | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState("");
  /** Відповідь на «Запропонувати»: показуємо над списком, доки людина не почне друкувати знову. */
  const [notice, setNotice] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadTagEngine().then((module) => !cancelled && setEngine(module));
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = useMemo(() => new Set(selected), [selected]);
  const groupLabel = useMemo(() => new Map((engine?.TAG_GROUPS ?? []).map((group) => [group.id, group.label])), [engine]);
  const searching = query.trim().length >= MIN_QUERY;
  const hits = useMemo(() => (engine && searching ? engine.searchTags(query, { limit: SEARCH_LIMIT }) : null), [engine, query, searching]);

  // «Нічого не знайшлося» рахуємо, коли людина зупинилась, а не на кожній літері, і раз на різний запит.
  const reportedEmpty = useRef(new Set<string>());
  const noResults = Boolean(hits && hits.length === 0);
  useEffect(() => {
    const text = query.trim();
    if (!noResults || text.length < 3 || reportedEmpty.current.has(text)) return;
    const timer = window.setTimeout(() => {
      reportedEmpty.current.add(text);
      trackSearchEmpty(context, text);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [noResults, query, context]);

  const pick = (tagId: string) => {
    const wasChosen = chosen.has(tagId);
    // З якого місця видачі вибрали: за цим видно, чи пошук ставить потрібне вгору.
    const rank = hits ? hits.findIndex((hit) => hit.tagId === tagId) : -1;
    const done = onToggle(tagId);
    if (!done) return;
    if (!wasChosen && hits && rank >= 0) trackTagPicked(context, tagId, rank, hits[rank].via);
    setStatus(`${labelOf(tagId)}: ${wasChosen ? "прибрано" : "додано"}`);
    // Зазвичай додають кілька поспіль: пошук очищуємо, панель лишається відкритою.
    setQuery("");
  };

  const propose = async () => {
    if (!onPropose || proposing) return;
    setProposing(true);
    const outcome = await onPropose(query.trim());
    setProposing(false);
    if (outcome.kind === "existing") {
      // Такий тег уже був: людина просто не знайшла його за назвою.
      onToggle(outcome.tagId);
      setNotice(`Такий тег уже є: «${labelOf(outcome.tagId)}». Додали його.`);
      setQuery("");
    } else if (outcome.kind === "proposed") {
      setNotice(context === "request" ? "Дякуємо! Передали на розгляд: коли додамо тег, його розпізнають у наступних запитах." : "Передано на розгляд. Коли додамо тег у словник, він з'явиться у вашому профілі сам.");
      setQuery("");
    } else {
      setNotice(outcome.message);
    }
  };

  const row = (section: string, tagId: string, via?: { phrase: string }) => {
    const checked = chosen.has(tagId);
    const group = engine?.TAGS.find((tag) => tag.id === tagId)?.group;
    return (
      <CommandItem key={`${section}:${tagId}`} value={`${section}:${tagId}`} onSelect={() => pick(tagId)} disabled={!checked && Boolean(limitReached)} data-checked={checked || undefined}>
        <span className="ui-command-check" aria-hidden>
          {checked && <Check className="size-4" strokeWidth={2.4} />}
        </span>
        <span className="ui-command-main">
          <span className="ui-command-title">{highlight(labelOf(tagId), query)}</span>
          {via && <span className="ui-command-sub">за словом «{via.phrase}»</span>}
        </span>
        {group && <span className="ui-command-meta">{groupLabel.get(group)}</span>}
        <span className="sr-only">{checked ? ", вибрано" : ""}</span>
      </CommandItem>
    );
  };

  return (
    <Command shouldFilter={false} loop label="Пошук тегу">
      <CommandInput value={query} onValueChange={(value) => { setQuery(value); setNotice(null); }} placeholder="Пошук: Telegram-бот, Figma, стоматологія…" aria-label="Пошук тегу" />
      {notice && (
        <p className="ui-command-note" role="status" data-tone="notice">
          {notice}
        </p>
      )}
      {limitReached && <p className="ui-command-note">{limitHint ?? "Досягнуто ліміту тегів. Знайте один зайвий, щоб додати інший."}</p>}
      <CommandList>
        {!engine && <p className="ui-command-empty">Завантажуємо теги…</p>}

        {engine && hits && hits.length > 0 && <CommandGroup>{hits.map((hit) => row("hit", hit.tagId, hit.via === "synonym" ? { phrase: hit.phrase } : undefined))}</CommandGroup>}

        {engine && hits && hits.length === 0 && (
          <div className="ui-command-empty" role="status">
            <p>Такого тегу поки немає.</p>
            {onPropose && (
              <button type="button" className="ui-command-propose" disabled={proposing} onClick={() => void propose()}>
                {proposing ? "Надсилаємо…" : `Запропонувати «${query.trim()}»`}
              </button>
            )}
          </div>
        )}

        {engine && !hits && (
          <>
            {suggestions.length > 0 && <CommandGroup heading="Пропонуємо">{suggestions.map((tagId) => row("suggest", tagId))}</CommandGroup>}
            {engine.TAG_GROUPS.map((group) => {
              const all = engine.TAGS.filter((tag) => tag.group === group.id).sort((a, b) => a.label.localeCompare(b.label, "uk"));
              const open = expanded.has(group.id);
              const shown = open ? all : all.slice(0, GROUP_PREVIEW);
              return (
                <CommandGroup key={group.id} heading={group.label}>
                  {shown.map((tag) => row(group.id, tag.id))}
                  {all.length > GROUP_PREVIEW && (
                    <button type="button" className="ui-command-more" aria-expanded={open} onClick={() => setExpanded((current) => (open ? new Set([...current].filter((id) => id !== group.id)) : new Set([...current, group.id])))}>
                      {open ? "Згорнути" : `Показати всі (${all.length})`}
                    </button>
                  )}
                </CommandGroup>
              );
            })}
          </>
        )}
      </CommandList>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </Command>
  );
}

/**
 * Вибір тегу пошуком по всьому словнику: на комп'ютері випадайка під
 * кнопкою, на телефоні шторка знизу. Нічого не знає про профіль чи запит:
 * отримує вибрані теги і повідомляє, який тег додали чи зняли.
 */
export function TagPicker(props: TagPickerProps) {
  const { trigger, inline, title = "Додати тег", limitReached } = props;
  const [open, setOpen] = useState(false);
  const mobile = useMediaQuery("(max-width: 639px)");

  useEffect(() => {
    if (open) trackPickerOpened(props.context);
    // Лише відкриття: контекст не міняється за життя пікера.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (inline) {
    return (
      <div className="ui-inline-picker">
        <TagPickerPanel {...props} />
      </div>
    );
  }

  const button = trigger ?? (
    <button type="button" className="tag-chip" data-kind="add" data-limit={limitReached || undefined}>
      <Plus className="size-3 shrink-0" />
      <span className="tag-chip-label">Додати тег</span>
    </button>
  );

  // Escape закриває лише вибір, а не редактор під ним: подію позначаємо як оброблену.
  const closeOnEscape = (event: KeyboardEvent) => {
    event.preventDefault();
    setOpen(false);
  };

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{button}</SheetTrigger>
        <SheetContent onEscapeKeyDown={closeOnEscape} className="ui-sheet-picker">
          <SheetTitle className="ui-sheet-title">{title}</SheetTitle>
          <SheetDescription className="sr-only">Знайдіть тег пошуком і виберіть його зі списку.</SheetDescription>
          <TagPickerPanel {...props} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent onEscapeKeyDown={closeOnEscape} className="ui-popover-picker" aria-label={title}>
        <TagPickerPanel {...props} />
      </PopoverContent>
    </Popover>
  );
}
