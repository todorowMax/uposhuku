"use client";

// components/profile/profile-editor.tsx
//
// Профіль виконавця: фото й коротко про себе, «Про себе» вільним текстом і окремо роботи. З обох текстів теги
// розбираються самі, як у полі запиту: з «Про себе» заявлені навички, з робіт підтверджені (з галочкою).
// Це екран за DESIGN.md («Шари»): на телефоні на весь екран, від 768 px вікно по центру з переглядом картки збоку.
// Низ закріплений з однією головною кнопкою; друга дія в шапці. Логіка в `use-profile-editor.ts`, блоки в `parts/`.

import { Check, Loader2 } from "@/components/icons";
import { ProfileAboutSection } from "@/components/profile/parts/profile-about-section";
import { ProfileBioSection } from "@/components/profile/parts/profile-bio-section";
import { ProfileCloseSheet } from "@/components/profile/parts/profile-close-sheet";
import { ProfilePreview } from "@/components/profile/parts/profile-preview";
import { ProfileWorksSection } from "@/components/profile/parts/profile-works-section";
import { LocationPicker } from "@/components/profile/location-picker";
import { PayoutSection } from "@/components/payouts/payout-section";
import { RequisitesSection } from "@/components/requisites/requisites-section";
import { useProfileEditor } from "@/components/profile/use-profile-editor";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { placementOpenStore } from "@/lib/placement/client";
import { MIN_PAYMENT } from "@/lib/placement/pricing";
import { profileEditorStore } from "@/lib/profile/client";
import { openAfterLayers } from "@/lib/ui/use-layer-history";

const FORM_ID = "pe-form";

const subtitle = (published: boolean, onMap: boolean) => {
  if (!published) return "Заповніть і опублікуйте: так ви зможете відгукуватися на запити.";
  return onMap ? "Вас видно на карті. Зміни з'являться після збереження." : "Профіль опубліковано, але на карті вас ще немає.";
};

export const ProfileEditor = () => {
  const editor = useProfileEditor();
  const { about, isPublished, busy, missing, dirty, onMap, saved, error } = editor;
  const toPlacement = () => {
    profileEditorStore.set(false);
    openAfterLayers(() => placementOpenStore.set(true));
  };
  const secondary = isPublished ? { kind: "unpublish" as const, label: "Приховати", name: "Приховати профіль" } : { kind: "draft" as const, label: "Зберегти", name: "Зберегти чернетку" };
  const primaryDisabled = Boolean(busy) || missing.length > 0 || (isPublished && !dirty);
  const primaryBusy = isPublished ? busy === "draft" : busy === "publish";
  return (
    <>
      <Screen
        open
        onOpenChange={(next) => !next && editor.requestClose()}
        title={isPublished ? "Ваш профіль" : "Профіль виконавця"}
        description="Фото, імʼя, місто, про себе й роботи. Праворуч або внизу видно, як вас бачать замовники."
        desktop="dialog"
        width="wide"
        action={
          <Button variant="quiet" aria-label={secondary.name} disabled={Boolean(busy)} onClick={() => void editor.save(secondary.kind)}>
            {busy === secondary.kind && <Loader2 className="size-4 animate-spin" />}
            {secondary.label}
          </Button>
        }
        footer={
          <div className="grid gap-2 md:justify-items-end">
            {error && (
              <p role="alert" className="auth-error md:justify-self-start">
                {error}
              </p>
            )}
            <Button type="submit" form={FORM_ID} className="w-full md:w-auto md:min-w-56" disabled={primaryDisabled}>
              {primaryBusy && <Loader2 className="size-4 animate-spin" />}
              {isPublished ? "Зберегти зміни" : "Опублікувати профіль"}
            </Button>
            <p role="status" className="sr-only">
              {saved ? "Збережено" : ""}
            </p>
          </div>
        }
      >
        <div className="pe-body">
          <p className="pe-hint">{subtitle(isPublished, onMap)}</p>
          <ul className="pe-checks" aria-label={`Заповнено ${editor.done} з ${editor.checks.length}`}>
            {editor.checks.map(([label, ok]) => (
              <li key={label} data-ok={ok || undefined}>
                {ok ? <Check className="size-3" /> : <span aria-hidden className="pe-check-dot" />}
                {label}
              </li>
            ))}
          </ul>
          <div className="pe-layout">
            <form
              id={FORM_ID}
              className="pe-form"
              onSubmit={(event) => {
                event.preventDefault();
                void editor.save(isPublished ? "draft" : "publish");
              }}
            >
              <ProfileAboutSection values={about} onMap={onMap} onChange={editor.changeAbout} onPickLocation={() => editor.setPicking(true)} />
              <ProfileBioSection bio={editor.bio} bioMentions={editor.bioMentions} tagging={editor.tagging} proposals={editor.proposals} proven={editor.proven} onBioChange={editor.setBio} />
              <ProfileWorksSection works={editor.works} onChange={editor.updateWork} onRemove={editor.removeWork} onAdd={editor.addWork} />
              <RequisitesSection />
              <PayoutSection />
              {!isPublished && missing.length > 0 && <p className="pe-missing">Щоб опублікувати профіль, додайте: {missing.join(", ")}.</p>}
              {isPublished && !onMap && (
                <p className="pe-notice">
                  Вас не видно на карті, поки не оплачено розміщення від {MIN_PAYMENT} ₴.{" "}
                  <Button variant="link" className="text-xs" onClick={toPlacement}>
                    Стати на карту
                  </Button>
                </p>
              )}
            </form>
            <ProfilePreview
              about={about}
              bio={editor.bio}
              works={editor.works}
              preview={editor.preview}
              cityName={editor.cityName}
              allTags={editor.allTags}
              proven={editor.proven}
              isPublished={isPublished}
              labelOf={editor.tagging.labelOf}
            />
          </div>
        </div>
      </Screen>
      <ProfileCloseSheet
        open={editor.confirmClose}
        busy={Boolean(busy)}
        onOpenChange={editor.setConfirmClose}
        onSaveAndLeave={() => void editor.save("draft", true)}
        onLeave={() => profileEditorStore.set(false)}
      />
      {editor.picking && <LocationPicker initial={about.location} cityId={about.cityId} onClose={() => editor.setPicking(false)} onConfirm={editor.confirmLocation} />}
    </>
  );
};
