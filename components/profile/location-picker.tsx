"use client";

// components/profile/location-picker.tsx
//
// Вибір точки на карті. Карту можна наближати й рухати, клік ставить точку, її можна перетягнути. «Зняти» прибирає
// чернетку точки, «Підтвердити» віддає її профілю. Поки не підтвердили, нічого не збережено: випадкове тикання не
// псує профіль. Це екран (DESIGN.md, «Шари»), а не шторка: карту тягнуть пальцем, а шторка закривалася б від свайпу.
// Логіка карти в `use-location-picker.ts`.

import { Check, Eraser, MapPin } from "@/components/icons";
import { useLocationPicker, type LocationPickerTypes } from "@/components/profile/use-location-picker";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";

export namespace LocationPickerScreenTypes {
  export type Props = {
    initial: LocationPickerTypes.Point | null;
    cityId: string;
    onConfirm: (point: LocationPickerTypes.Point | null) => void;
    onClose: () => void;
  };
}

export const LocationPicker = ({ initial, cityId, onConfirm, onClose }: LocationPickerScreenTypes.Props) => {
  const { setContainer, setDraft, draft, near, failed, changed, removing } = useLocationPicker(initial, cityId);
  return (
    <Screen
      open
      onOpenChange={(next) => !next && onClose()}
      title="Де вас показувати"
      description="Наблизьте карту й торкніться місця. Точку можна перетягнути."
      desktop="dialog"
      width="wide"
      action={
        <Button variant="quiet" onClick={() => setDraft(null)} disabled={!draft}>
          <Eraser className="size-4" />
          Зняти точку
        </Button>
      }
      footer={
        <Button className="w-full" onClick={() => onConfirm(draft)} disabled={!changed}>
          <Check className="size-4" />
          {removing ? "Прибрати точку" : "Підтвердити"}
        </Button>
      }
    >
      <div className="loc-pane">
        <div className="loc-map-wrap">
          <div ref={setContainer} className="loc-map" />
          {failed && <p className="loc-fail">Карта не завантажилась. Закрийте вікно й оберіть місто зі списку.</p>}
          {!draft && !failed && <p className="loc-hint">Торкніться карти, щоб поставити точку</p>}
        </div>
        <div className="loc-note">
          <MapPin className="size-4 shrink-0" />
          {draft && near ? (
            <span>
              {draft.lat.toFixed(3)}, {draft.lng.toFixed(3)} · найближче місто: {near.city.name}. Точку побачать усі, тож ставте її приблизно, а не біля дверей.
            </span>
          ) : (
            <span>Без точки ми поставимо вас біля центру вашого міста.</span>
          )}
        </div>
      </div>
    </Screen>
  );
};
