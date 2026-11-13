"use client";

// «Про вас»: фото, імʼя, місто з точкою на карті, спеціальність. Стан тримає `use-profile-editor.ts`.

import { MapPinned } from "@/components/icons";
import { PhotoField } from "@/components/profile/photo-field";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CITIES } from "@/lib/map/cities";
import { MIN_PAYMENT } from "@/lib/placement/pricing";
import { PROFILE_LIMITS } from "@/lib/profile/types";
import type { ProfileEditorTypes } from "@/components/profile/use-profile-editor";

export namespace ProfileAboutSectionTypes {
  export type Props = {
    values: ProfileEditorTypes.About;
    onMap: boolean;
    onChange: (patch: Partial<ProfileEditorTypes.About>) => void;
    onPickLocation: () => void;
  };
}

const CITY_OPTIONS = [...CITIES].sort((a, b) => a.name.localeCompare(b.name, "uk"));

export const ProfileAboutSection = ({ values, onMap, onChange, onPickLocation }: ProfileAboutSectionTypes.Props) => {
  const { name, cityId, location, specialty, photo } = values;
  return (
    <section className="pe-section" aria-labelledby="pe-about-you">
      <h2 id="pe-about-you" className="pe-title">
        Про вас
      </h2>
      <PhotoField value={photo} name={name} onChange={(next) => onChange({ photo: next })} />

      <div className="pe-grid">
        <Field label="Ім'я" htmlFor="pe-name">
          <Input id="pe-name" value={name} maxLength={PROFILE_LIMITS.name} onChange={(event) => onChange({ name: event.target.value })} autoComplete="name" placeholder="Олена Ковальчук" />
        </Field>
        <div>
          <label htmlFor="pe-city" className="pe-label">
            Місто
          </label>
          <div className="loc-field">
            <Select value={cityId} onValueChange={(next) => onChange({ cityId: next })}>
              <SelectTrigger id="pe-city" className="w-full" data-empty={!cityId || undefined}>
                <SelectValue placeholder="Оберіть місто" />
              </SelectTrigger>
              <SelectContent>
                {CITY_OPTIONS.map((city) => (
                  <SelectItem key={city.id} value={city.id}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="bare"
              onClick={onPickLocation}
              className="loc-button"
              data-set={location ? true : undefined}
              aria-label={location ? "Змінити точку на карті" : "Поставити точку на карті"}
              title={location ? "Точку задано. Змінити на карті" : "Поставити точку на карті"}
            >
              <MapPinned className="size-4.5" />
            </Button>
          </div>
        </div>
      </div>

      <p className="pe-hint mt-1.5">
        {location ? "Ваша точка на карті задана. Її видно всім, коли ви на карті." : "Значок праворуч від міста відкриває карту: на ній можна поставити точку точніше."}
        {!onMap && ` На карті ви з'явитесь після оплати розміщення, від ${MIN_PAYMENT} ₴. Відгукуватися на запити можна й без оплати.`}
      </p>

      <Field label="Ким працюєте" htmlFor="pe-specialty" className="mt-3" hint="Коротко, одним рядком: це видно в картці під іменем.">
        <Input id="pe-specialty" value={specialty} maxLength={PROFILE_LIMITS.specialty} onChange={(event) => onChange({ specialty: event.target.value })} placeholder="Наприклад: UI/UX дизайнер" />
      </Field>
    </section>
  );
};
