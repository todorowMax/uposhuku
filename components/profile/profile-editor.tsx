"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { Check, Loader2, Plus, X } from "lucide-react";
import { PerformerAbout } from "@/components/maplibre/performer-about";
import { PhotoField } from "@/components/profile/photo-field";
import { TagChips } from "@/components/profile/tag-chips";
import { TaggedField } from "@/components/profile/tagged-field";
import { WorkEditor } from "@/components/profile/work-editor";
import { ApiError, sessionStore } from "@/lib/auth/client";
import { CITIES } from "@/lib/map/cities";
import { placementOpenStore } from "@/lib/placement/client";
import { profileEditorStore, profileStore, saveMyProfile } from "@/lib/profile/client";
import { profileToPerformer } from "@/lib/profile/to-performer";
import { PROFILE_LIMITS, emptyProfile, missingForPublish, profileTags, provenTags, type Profile, type ProfileWork } from "@/lib/profile/types";
import { useTagging } from "@/lib/tags/use-tagging";
import { useStore } from "@/lib/store";

const CITY_OPTIONS = [...CITIES].sort((a, b) => a.name.localeCompare(b.name, "uk"));
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const newWork = (): ProfileWork => ({ id: `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title: "", description: "", url: "", tags: [] });

/** Те, що людина змінює: без часу збереження, щоб порівнювати «було — стало». */
const snapshot = (profile: Profile) => JSON.stringify({ ...profile, updatedAt: "" });

/**
 * Профіль виконавця: фото й коротко про себе, «Про себе» вільним текстом і
 * окремо — роботи. З обох текстів теги розбираються самі, як у полі запиту:
 * з «Про себе» — заявлені навички, з робіт — підтверджені (з галочкою).
 * Праворуч живий перегляд тієї самої картки, яку бачать замовники.
 */
export function ProfileEditor() {
  const session = useStore(sessionStore);
  const profileState = useStore(profileStore);
  const stored = profileState.status === "ready" ? profileState.profile : null;
  const userName = session.status === "user" ? (session.user.name ?? "") : "";

  const [name, setName] = useState(stored?.name ?? userName);
  const [cityId, setCityId] = useState(stored?.cityId ?? "");
  const [specialty, setSpecialty] = useState(stored?.specialty ?? "");
  const [bio, setBio] = useState(stored?.bio ?? "");
  const [photo, setPhoto] = useState(stored?.photo ?? "");
  const [works, setWorks] = useState<ProfileWork[]>(stored?.works ?? []);
  const [busy, setBusy] = useState<"publish" | "draft" | "unpublish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const initialSnapshot = useRef<string | null>(null);

  // Спеціальність і «Про себе» — один текст для тегів; підкреслюємо лише в «Про себе».
  const tagging = useTagging(`${specialty}\n${bio}`, stored?.tags ?? []);
  const bioOffset = specialty.length + 1;
  const bioMentions = tagging.mentions
    .filter((mention) => mention.start >= bioOffset)
    .map((mention) => ({ ...mention, start: mention.start - bioOffset, end: mention.end - bioOffset }));

  const draft: Profile = useMemo(
    () => ({
      ...emptyProfile(),
      name,
      cityId,
      specialty,
      bio,
      tags: tagging.tags,
      works,
      photo,
      published: stored?.published ?? false,
    }),
    [name, cityId, specialty, bio, tagging.tags, works, photo, stored?.published]
  );
  const proven = useMemo(() => provenTags(draft), [draft]);
  const allTags = useMemo(() => profileTags(draft), [draft]);
  const missing = missingForPublish(draft);
  const isPublished = Boolean(stored?.published);

  // «Було» запам'ятовуємо, коли словник підвантажився: до того теги ще порожні.
  useEffect(() => {
    if (tagging.engine && initialSnapshot.current === null) initialSnapshot.current = snapshot(draft);
  }, [tagging.engine, draft]);
  const dirty = initialSnapshot.current !== null && snapshot(draft) !== initialSnapshot.current;

  useEffect(() => {
    if (saved) {
      const timer = window.setTimeout(() => setSaved(false), 2400);
      return () => window.clearTimeout(timer);
    }
  }, [saved]);

  useLayoutEffect(() => {
    if (!overlayRef.current || reduced()) return;
    const tween = gsap.fromTo(overlayRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" });
    return () => {
      tween.kill();
    };
  }, []);

  useEffect(() => {
    firstFieldRef.current?.focus({ preventScroll: true });
  }, []);

  const requestClose = () => {
    if (dirty && !busy) setConfirmClose(true);
    else profileEditorStore.set(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const save = async (kind: "publish" | "draft" | "unpublish", closeAfter = false) => {
    setBusy(kind);
    setError(null);
    setConfirmClose(false);
    try {
      const published = kind === "publish" ? true : kind === "unpublish" ? false : isPublished;
      await saveMyProfile({ ...draft, published });
      initialSnapshot.current = snapshot({ ...draft, published });
      if (kind === "publish" || closeAfter) profileEditorStore.set(false);
      else setSaved(true);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося зберегти профіль.");
    } finally {
      setBusy(null);
    }
  };

  const updateWork = (id: string, patch: Partial<ProfileWork>) =>
    setWorks((current) => current.map((work) => (work.id === id ? { ...work, ...patch } : work)));
  const addWork = () => {
    const work = newWork();
    setWorks((current) => [...current, work]);
    window.setTimeout(() => document.getElementById(`work-${work.id}-title`)?.focus(), 60);
  };

  const preview = useMemo(
    () => profileToPerformer({ ...draft, cityId: cityId || "kyiv" }, "preview", 0),
    [draft, cityId]
  );
  const cityName = CITIES.find((city) => city.id === cityId)?.name;

  const checks: [string, boolean][] = [
    ["Фото", Boolean(photo)],
    ["Ім'я", Boolean(name.trim())],
    ["Місто", Boolean(cityId)],
    ["Спеціальність", Boolean(specialty.trim())],
    [`${PROFILE_LIMITS.minTags}+ теги`, allTags.length >= PROFILE_LIMITS.minTags],
  ];
  const done = checks.filter(([, ok]) => ok).length;

  return (
    <div ref={overlayRef} role="dialog" aria-modal="true" aria-label="Профіль виконавця" className="pe-overlay">
      <header className="pe-header">
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold text-ink">{isPublished ? "Ваш профіль" : "Профіль виконавця"}</h1>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {isPublished ? "Вас видно на карті. Зміни з'являться після збереження." : "Заповніть, і вас побачать замовники з потрібними запитами."}
          </p>
        </div>
        <ul className="pe-checks" aria-label={`Заповнено ${done} з ${checks.length}`}>
          {checks.map(([label, ok]) => (
            <li key={label} data-ok={ok || undefined}>
              {ok ? <Check className="size-3" strokeWidth={3} /> : <span aria-hidden className="pe-check-dot" />}
              {label}
            </li>
          ))}
        </ul>
        <button type="button" onClick={requestClose} aria-label="Закрити" className="auth-icon-button shrink-0">
          <X className="size-5" strokeWidth={2} />
        </button>
      </header>

      <div className="pe-scroll">
        <div className="pe-layout">
          <form
            className="pe-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save(isPublished ? "draft" : "publish");
            }}
          >
            <section className="pe-section" aria-labelledby="pe-about-you">
              <h2 id="pe-about-you" className="pe-title">
                Про вас
              </h2>
              <PhotoField value={photo} name={name} onChange={setPhoto} />

              <div className="pe-grid">
                <div>
                  <label htmlFor="pe-name" className="pe-label">
                    Ім'я
                  </label>
                  <input
                    id="pe-name"
                    ref={firstFieldRef}
                    value={name}
                    maxLength={PROFILE_LIMITS.name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    placeholder="Олена Ковальчук"
                    className="auth-input w-full"
                  />
                </div>
                <div>
                  <label htmlFor="pe-city" className="pe-label">
                    Місто
                  </label>
                  <select id="pe-city" value={cityId} onChange={(event) => setCityId(event.target.value)} className="auth-input w-full" data-empty={!cityId || undefined}>
                    <option value="">Оберіть місто</option>
                    {CITY_OPTIONS.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label htmlFor="pe-specialty" className="pe-label mt-3">
                Ким працюєте
              </label>
              <input
                id="pe-specialty"
                value={specialty}
                maxLength={PROFILE_LIMITS.specialty}
                onChange={(event) => setSpecialty(event.target.value)}
                placeholder="Наприклад: UI/UX дизайнер"
                className="auth-input w-full"
              />
              <p className="pe-hint">Коротко, одним рядком: це видно в картці під іменем.</p>
            </section>

            <section className="pe-section" aria-labelledby="pe-about-me">
              <h2 id="pe-about-me" className="pe-title">
                Про себе і чим займаєтесь
              </h2>
              <p className="pe-hint -mt-1">
                Пишіть як людині: що робите, для кого, чим. Ми самі виберемо теги, за якими вас знайдуть, а слова, з яких вони взяті, підкреслимо.
              </p>
              <div className="pe-textbox">
                <TaggedField
                  id="pe-bio"
                  value={bio}
                  onChange={setBio}
                  mentions={bioMentions}
                  maxLength={PROFILE_LIMITS.bio}
                  minRows={5}
                  describedBy="pe-bio-count"
                  placeholder="Роблю Telegram-боти й автоматизації для малого бізнесу: салони, клініки, доставка. Працюю з n8n і Python, підключаю Monobank та Нова Пошта. Можу взяти проєкт від ТЗ до запуску."
                />
              </div>
              <p id="pe-bio-count" className="pe-counter">
                {bio.length}/{PROFILE_LIMITS.bio}
              </p>

              <h3 className="pe-label mt-1">Ваші теги</h3>
              <TagChips
                tags={tagging.tags}
                suggestions={tagging.suggestions}
                proven={proven}
                labelOf={tagging.labelOf}
                onRemove={tagging.remove}
                onAdd={tagging.add}
                emptyHint="Розкажіть про себе вище, і теги з'являться тут самі. Нічого не знайшлося? Опишіть конкретніше: що саме робите."
              />
              <p className="pe-hint">Галочка — тег підтверджений вашою роботою. Такі теги вагоміші: за запитом вас покажуть вище.</p>
            </section>

            <section className="pe-section" aria-labelledby="pe-works">
              <div className="flex items-end justify-between gap-3">
                <h2 id="pe-works" className="pe-title">
                  Роботи
                </h2>
                <span className="text-[12px] text-ink-muted">
                  {works.length}/{PROFILE_LIMITS.works}
                </span>
              </div>
              <p className="pe-hint -mt-1">
                Окремо від «Про себе»: тут конкретні проєкти. Розкажіть про кожен, і його теги підтвердять ваші навички. Додайте хоча б одну роботу: профілі з роботами довіряють більше.
              </p>
              {works.map((work, index) => (
                <WorkEditor key={work.id} work={work} index={index} onChange={(patch) => updateWork(work.id, patch)} onRemove={() => setWorks((current) => current.filter((item) => item.id !== work.id))} />
              ))}
              {works.length < PROFILE_LIMITS.works && (
                <button type="button" onClick={addWork} className="pe-add">
                  <Plus className="size-4" strokeWidth={2.2} />
                  {works.length ? "Ще одна робота" : "Додати роботу"}
                </button>
              )}
            </section>

            <footer className="pe-footer">
              {confirmClose ? (
                <div className="pe-confirm" role="alertdialog" aria-label="Незбережені зміни">
                  <p className="text-[13px] font-medium text-ink">Є незбережені зміни.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void save("draft", true)} className="offer-primary">
                      Зберегти й вийти
                    </button>
                    <button type="button" onClick={() => profileEditorStore.set(false)} className="offer-secondary">
                      Не зберігати
                    </button>
                    <button type="button" onClick={() => setConfirmClose(false)} className="offer-secondary">
                      Лишитись
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {error && (
                    <p role="alert" className="auth-error w-full">
                      {error}
                    </p>
                  )}
                  {!isPublished && missing.length > 0 && <p className="pe-missing">Щоб показатися на карті, додайте: {missing.join(", ")}.</p>}
                  <div className="pe-actions">
                    {isPublished ? (
                      <>
                        <button type="submit" disabled={Boolean(busy) || missing.length > 0 || !dirty} className="auth-primary pe-primary">
                          {busy === "draft" && <Loader2 className="size-4 animate-spin" />}
                          Зберегти зміни
                        </button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => void save("unpublish")} className="auth-secondary">
                          {busy === "unpublish" && <Loader2 className="size-4 animate-spin" />}
                          Зняти з карти
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="submit" disabled={Boolean(busy) || missing.length > 0} className="auth-primary pe-primary">
                          {busy === "publish" && <Loader2 className="size-4 animate-spin" />}
                          Показати на карті
                        </button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => void save("draft")} className="auth-secondary">
                          {busy === "draft" && <Loader2 className="size-4 animate-spin" />}
                          Зберегти чернетку
                        </button>
                      </>
                    )}
                    <span role="status" className="pe-saved" data-shown={saved || undefined}>
                      <Check className="size-3.5" strokeWidth={3} />
                      Збережено
                    </span>
                  </div>
                </>
              )}
            </footer>
          </form>

          <aside className="pe-preview" aria-label="Так вас бачать замовники">
            <p className="pe-preview-caption">Так вас бачать замовники</p>
            <div className="pe-card glass-panel">
              <div className="flex items-center gap-3">
                <div
                  className="pe-card-photo"
                  role="img"
                  aria-label={name ? `Фото ${name}` : "Фото"}
                  style={photo ? { backgroundImage: `url(${photo})` } : undefined}
                  data-empty={!photo || undefined}
                />
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold leading-tight text-ink">{name.trim() || "Ваше ім'я"}</p>
                  <p className="mt-1 text-[12px] leading-snug text-ink-muted">{specialty.trim() || "Ваша спеціальність"}</p>
                  <p className="mt-1 text-[11px] text-ink-muted">{cityName ?? "Місто"}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 divide-x divide-[#b8c4c7]/55 rounded-2xl bg-white/45 py-3 text-center">
                <div>
                  <p className="text-[16px] font-semibold text-ink">0 міс.</p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">на платформі</p>
                </div>
                <div>
                  <p className="text-[16px] font-semibold text-ink">0</p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">замовлень</p>
                </div>
                <div>
                  <p className="text-[16px] font-semibold text-ink">—</p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">рейтинг</p>
                </div>
              </div>
              {preview && (bio.trim() || works.length > 0) ? (
                <PerformerAbout key={`${preview.works.length}-${bio.length > 0}`} performer={preview} onOpenWork={() => {}} />
              ) : (
                <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">Тут з'являться ваш опис і роботи.</p>
              )}
              {allTags.length > 0 && (
                <div className="mt-4 border-t border-[#b8c4c7]/45 pt-3">
                  <p className="text-[11px] font-semibold text-ink-muted">Вас знайдуть за тегами</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {allTags.map((id) => (
                      <span key={id} className="auth-draft-tag">
                        {proven.has(id) && <Check className="mr-1 size-3 text-[#8e5f40]" strokeWidth={3} aria-label="Підтверджено роботою" />}
                        {tagging.labelOf(id)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <p className="pe-preview-note">
              Розмір вашого маркера на карті залежить від платного розміщення.{" "}
              {isPublished && (
                <button type="button" onClick={() => placementOpenStore.set(true)} className="auth-link text-[11px]">
                  Стати на карту
                </button>
              )}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Редактор поверх усього, коли відкритий і людина увійшла. */
export function ProfileEditorHost() {
  const open = useStore(profileEditorStore);
  const session = useStore(sessionStore);
  const profileState = useStore(profileStore);
  if (!open || session.status !== "user") return null;
  // Чекаємо, поки профіль завантажиться: інакше форма стартувала б порожньою й затерла б збережене.
  if (profileState.status !== "ready") {
    return (
      <div className="pe-overlay grid place-items-center" role="status" aria-label="Завантажуємо профіль">
        <Loader2 className="size-6 animate-spin text-ink-muted" />
      </div>
    );
  }
  return <ProfileEditor />;
}
