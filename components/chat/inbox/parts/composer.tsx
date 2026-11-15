"use client";

// components/chat/inbox/parts/composer.tsx
//
// Поле повідомлення: підказки про контакти й реквізити, фото до надсилання, «+», текст, «Надіслати».

import { ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Textarea } from "@/components/ui/input";
import { mentionsContacts } from "@/lib/chat/contacts";
import { PAYMENT_HINT, mentionsPaymentDetails } from "@/lib/chat/payment-hints";
import { draftLimit } from "@/lib/chat/draft-limit";
import type { StagedPhoto } from "../use-photo-staging";

export const Composer = ({
  draft,
  placeholder,
  photos,
  photoError,
  sendError,
  canSend,
  gone,
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
  sendError: string | null;
  canSend: boolean;
  /** Співрозмовник видалив акаунт: замість поля текст. */
  gone: boolean;
  fileRef: React.Ref<HTMLInputElement>;
  onType: (value: string) => void;
  onSubmit: () => void;
  onPlus: () => void;
  onFiles: (files: FileList | null) => void;
  onRemovePhoto: (tempId: string) => void;
}) => {
  if (gone) {
    return (
      <p className="dm-closed" role="status">
        Співрозмовник видалив акаунт
      </p>
    );
  }
  const limit = draftLimit(draft.length);
  return (
    <>
      {limit.show && (
        <p className="dm-warn dm-counter" data-over={limit.over || undefined} role={limit.over ? "alert" : undefined}>
          {limit.over ? "Задовге повідомлення: " : ""}
          {limit.text}
        </p>
      )}
      {mentionsContacts(draft) && <p className="dm-warn">Домовляйтеся тут: поза чатом ми не побачимо домовленостей.</p>}
      {mentionsPaymentDetails(draft) && <p className="dm-warn">{PAYMENT_HINT}</p>}
      {photoError && <p className="dm-warn">{photoError}</p>}
      {sendError && (
        <p className="dm-warn" role="alert">
          {sendError}
        </p>
      )}
      {photos.length > 0 && (
        <ul className="dm-staged">
          {photos.map((photo) => (
            <li key={photo.tempId} data-pending={!photo.id || undefined}>
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
        <FileInput ref={fileRef} accept="image/*" multiple onChange={(event) => onFiles(event.target.files)} />
        <Button variant="bare" className="dm-attach" aria-label="Додати" onClick={onPlus}>
          <Plus className="size-4" strokeWidth={2} />
        </Button>
        <label htmlFor="inbox-input" className="sr-only">
          Повідомлення
        </label>
        <Textarea
          id="inbox-input"
          variant="chat"
          rows={1}
          value={draft}
          onChange={(event) => onType(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
        />
        <Button type="submit" variant="bare" disabled={!canSend} aria-label="Надіслати" className="dm-send">
          <ArrowUp className="size-4" strokeWidth={2.4} />
        </Button>
      </form>
    </>
  );
};
