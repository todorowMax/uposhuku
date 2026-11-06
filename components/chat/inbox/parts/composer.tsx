"use client";

// components/chat/inbox/parts/composer.tsx
//
// Поле повідомлення: підказки про контакти й реквізити, фото до надсилання, «+», текст, «Надіслати».

import { ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mentionsContacts } from "@/lib/chat/contacts";
import { PAYMENT_HINT, mentionsPaymentDetails } from "@/lib/chat/payment-hints";
import { CHAT_TEXT_MAX } from "@/lib/chat/types";
import type { StagedPhoto } from "../use-photo-staging";

export const Composer = ({
  draft,
  placeholder,
  photos,
  photoError,
  canSend,
  fileRef,
  onType,
  onSubmit,
  onPlus,
  onFiles,
  onRemovePhoto,
}: {
  draft: string;
  placeholder: string;
  photos: StagedPhoto[];
  photoError: string | null;
  canSend: boolean;
  fileRef: React.Ref<HTMLInputElement>;
  onType: (value: string) => void;
  onSubmit: () => void;
  onPlus: () => void;
  onFiles: (files: FileList | null) => void;
  onRemovePhoto: (tempId: string) => void;
}) => (
  <>
    {mentionsContacts(draft) && <p className="dm-warn">Домовляйтеся тут: поза чатом ми не побачимо домовленостей.</p>}
    {mentionsPaymentDetails(draft) && <p className="dm-warn">{PAYMENT_HINT}</p>}
    {photoError && <p className="dm-warn">{photoError}</p>}
    {photos.length > 0 && (
      <ul className="dm-staged">
        {photos.map((photo) => (
          <li key={photo.tempId} data-pending={!photo.id || undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.preview} alt="" />
            <Button variant="bare" onClick={() => onRemovePhoto(photo.tempId)} aria-label="Прибрати фото">
              <X className="size-3" strokeWidth={2.4} />
            </Button>
          </li>
        ))}
      </ul>
    )}
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="dm-input-row"
    >
      {/* eslint-disable-next-line no-restricted-syntax -- прихований вибір файлу за кнопкою «+» (DS-2 це дозволяє) */}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => onFiles(event.target.files)} />
      <Button variant="bare" className="dm-attach" aria-label="Додати" onClick={onPlus}>
        <Plus className="size-4" strokeWidth={2} />
      </Button>
      <label htmlFor="inbox-input" className="sr-only">
        Повідомлення
      </label>
      {/* eslint-disable-next-line no-restricted-syntax -- поле чату росте за вмістом усередині .dm-input-row; Textarea додає власну рамку й відступи */}
      <textarea
        id="inbox-input"
        rows={1}
        value={draft}
        maxLength={CHAT_TEXT_MAX}
        onChange={(event) => onType(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        className="dm-input"
      />
      <Button type="submit" variant="bare" disabled={!canSend} aria-label="Надіслати" className="dm-send">
        <ArrowUp className="size-4" strokeWidth={2.4} />
      </Button>
    </form>
  </>
);
