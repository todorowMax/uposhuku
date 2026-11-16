"use client";

// components/requests/edit-request-screen.tsx
//
// «Редагувати запит» на екрані (DESIGN.md, «Шари»): текст, теги, умови й файли відкритого запиту. Поле тегів і чипи умов
// ті самі, що в полі нового запиту. Унизу закріплено «Зберегти» й «Скасувати». Логіка в `use-edit-request.ts`.

import { useRef } from "react";
import { RequestTagRow } from "@/components/composer/request-tag-row";
import { RequestParams } from "@/components/composer/request-params";
import { Attachments } from "@/components/composer/attachments";
import { Loader2, Paperclip } from "@/components/icons";
import { EditRequestCloseSheet } from "@/components/requests/parts/edit-request-close-sheet";
import { useEditRequest } from "@/components/requests/use-edit-request";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { REQUEST_FILE_ACCEPT } from "@/lib/requests/file-types";
import { Field, Textarea } from "@/components/ui/input";
import { Screen } from "@/components/ui/screen";
import { REQUEST_TEXT_MAX, type PublishedRequest } from "@/lib/requests/types";
import { sessionStore } from "@/lib/auth/client";
import { useStore } from "@/lib/store";

export namespace EditRequestScreenTypes {
  export type Props = {
    request: PublishedRequest;
    /** Скільки виконавців уже відгукнулося: їм покажемо, що запит змінено. */
    offers: number;
    onClose: () => void;
    onSaved: () => void;
  };
}

export const EditRequestScreen = ({ request, offers, onClose, onSaved }: EditRequestScreenTypes.Props) => {
  const edit = useEditRequest({ request, onClose, onSaved });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const session = useStore(sessionStore);
  return (
    <>
      <Screen
        open
        onOpenChange={(next) => !next && edit.requestClose()}
        title="Редагувати запит"
        description="Текст, теги, умови й файли вашого запиту."
        desktop="dialog"
        footer={
          <div className="grid gap-2">
            {edit.error && (
              <p role="alert" className="auth-error">
                {edit.error}
              </p>
            )}
            {offers > 0 && <p className="pe-hint">Виконавці, які вже відгукнулися, побачать, що запит змінено.</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={edit.busy} onClick={edit.requestClose}>
                Скасувати
              </Button>
              <Button disabled={!edit.canSave || edit.busy} onClick={() => void edit.save()}>
                {edit.busy && <Loader2 className="size-4 animate-spin" />}
                Зберегти
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-5">
          <Field
            label="Що потрібно зробити"
            htmlFor="edit-request-text"
            hint={`${edit.text.length}/${REQUEST_TEXT_MAX}`}
            error={edit.tooShort ? "Опишіть, що потрібно зробити." : null}
          >
            <Textarea
              id="edit-request-text"
              rows={6}
              value={edit.text}
              maxLength={REQUEST_TEXT_MAX}
              onChange={(event) => edit.setText(event.target.value)}
              aria-invalid={edit.tooShort || undefined}
            />
          </Field>

          <section aria-labelledby="edit-request-tags" className="min-w-0">
            <h3 id="edit-request-tags" className="pe-label">
              Теги
            </h3>
            <RequestTagRow tags={edit.tags} canPropose={session.status === "user"} />
          </section>

          <section aria-labelledby="edit-request-terms" className="min-w-0">
            <h3 id="edit-request-terms" className="pe-label">
              Умови
            </h3>
            <div className="-mx-1">
              <RequestParams value={edit.params} onChange={edit.setParams} />
            </div>
          </section>

          <section aria-labelledby="edit-request-files" className="min-w-0">
            <h3 id="edit-request-files" className="pe-label">
              Файли
            </h3>
            <Attachments items={edit.files.items} notice={edit.files.notice} onRemove={edit.files.remove} />
            <FileInput ref={fileInputRef} multiple accept={REQUEST_FILE_ACCEPT} onChange={edit.files.pick} />
            <Button variant="quiet" className="-ml-2" disabled={edit.filesFull} onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="size-4" aria-hidden />
              Додати файл
            </Button>
          </section>
        </div>
      </Screen>
      <EditRequestCloseSheet
        open={edit.confirmClose}
        busy={edit.busy}
        canSave={edit.canSave}
        onOpenChange={edit.setConfirmClose}
        onSaveAndLeave={() => void edit.save()}
        onLeave={edit.onLeave}
      />
    </>
  );
};
