"use client";

// Живий перегляд картки, яку бачать замовники. Праворуч від форми на широкому вікні, під формою на вузькому.

import { Check } from "@/components/icons";
import { PerformerAbout } from "@/components/maplibre/performer-about";
import { Button } from "@/components/ui/button";
import { placementOpenStore } from "@/lib/placement/client";
import type { ProfileEditor } from "@/components/profile/use-profile-editor";

export namespace ProfilePreviewTypes {
  export type Props = Pick<ProfileEditor, "about" | "bio" | "works" | "preview" | "cityName" | "allTags" | "proven" | "isPublished"> & {
    labelOf: (id: string) => string;
  };
}

export const ProfilePreview = ({ about, bio, works, preview, cityName, allTags, proven, isPublished, labelOf }: ProfilePreviewTypes.Props) => {
  const { name, photo, specialty } = about;
  return (
    <aside className="pe-preview" aria-label="Так вас бачать замовники">
      <p className="pe-preview-caption">Так вас бачать замовники</p>
      <div className="pe-card glass-panel">
        <div className="flex items-center gap-3">
          <div className="pe-card-photo" role="img" aria-label={name ? `Фото ${name}` : "Фото"} style={photo ? { backgroundImage: `url(${photo})` } : undefined} data-empty={!photo || undefined} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight text-ink">{name.trim() || "Ваше ім'я"}</p>
            <p className="mt-1 text-xs leading-snug text-ink-muted">{specialty.trim() || "Ваша спеціальність"}</p>
            <p className="mt-1 text-xs text-ink-muted">{cityName ?? "Місто"}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-white/45 py-3 text-center">
          <div>
            <p className="text-base font-semibold text-ink">0 міс.</p>
            <p className="mt-0.5 text-xs text-ink-muted">на платформі</p>
          </div>
          <div>
            <p className="text-base font-semibold text-ink">0</p>
            <p className="mt-0.5 text-xs text-ink-muted">замовлень</p>
          </div>
          <div>
            <p className="text-base font-semibold text-ink">—</p>
            <p className="mt-0.5 text-xs text-ink-muted">рейтинг</p>
          </div>
        </div>
        {preview && (bio.trim() || works.length > 0) ? (
          <PerformerAbout key={`${preview.works.length}-${bio.length > 0}`} performer={preview} onOpenWork={() => {}} />
        ) : (
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">Тут з&apos;являться ваш опис і роботи.</p>
        )}
        {allTags.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-xs font-semibold text-ink-muted">Вас знайдуть за тегами</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allTags.map((id) => (
                <span key={id} className="auth-draft-tag">
                  {proven.has(id) && <Check className="mr-1 size-3 text-brand" aria-label="Підтверджено роботою" />}
                  {labelOf(id)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="pe-preview-note">
        Без оплати розміщення вас не видно на карті. Розмір маркера залежить від суми, яку ви платите.{" "}
        {isPublished && (
          <Button variant="link" onClick={() => placementOpenStore.set(true)} className="text-xs">
            Стати на карту
          </Button>
        )}
      </p>
    </aside>
  );
};
