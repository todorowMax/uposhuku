"use client";

// components/requests/use-edit-request.ts
//
// Логіка екрана «Редагувати запит»: поля форми, чи є незбережені зміни, збереження й вихід. Що вважати зміною
// і яку чернетку слати, вирішують чисті функції в `lib/requests/edit-draft.ts`.

import { useState } from "react";
import { EMPTY_PARAMS, type RequestParamsValue } from "@/components/composer/request-params";
import { useRequestFiles } from "@/components/composer/use-request-files";
import { useRequestTags } from "@/components/composer/use-request-tags";
import { ApiError, updateActiveRequest } from "@/lib/auth/client";
import { canSaveEdit, draftFromForm, editTextValid, formChanged, initialRemote, initialTagState, type EditForm } from "@/lib/requests/edit-draft";
import { REQUEST_FILES_MAX } from "@/lib/requests/file-types";
import { REQUEST_TEXT_MIN, type PublishedRequest } from "@/lib/requests/types";
import { detectTagMentions, tagLabel } from "@/lib/tags/engine";

export namespace EditRequestTypes {
  export type Options = {
    request: PublishedRequest;
    /** Закрити екран. */
    onClose: () => void;
    /** Збережено: панель «Мої запити» повідомляє про це скрінрідеру. */
    onSaved: () => void;
  };
}

const paramsOf = (request: PublishedRequest): RequestParamsValue => ({
  ...EMPTY_PARAMS,
  budget: request.budget ?? null,
  deadline: request.deadline ?? null,
  deadlineDate: request.deadlineDate ?? null,
  cityId: request.cityId ?? null,
  remote: initialRemote(request.cityId),
  channel: request.channelOptIn !== false,
});

export const useEditRequest = ({ request, onClose, onSaved }: EditRequestTypes.Options) => {
  const [text, setText] = useState(request.text);
  const [params, setParams] = useState<RequestParamsValue>(() => paramsOf(request));
  const files = useRequestFiles(request.files);
  const [initialTags] = useState(() =>
    initialTagState(
      detectTagMentions(request.text).map((mention) => mention.tagId),
      request.tags,
    ),
  );
  const tags = useRequestTags(text, initialTags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const form: EditForm = { text, tagIds: tags.selected, files: files.files, budget: params.budget, deadline: params.deadline, deadlineDate: params.deadlineDate, cityId: params.cityId, channel: params.channel };
  const dirty = formChanged(request, form);
  // Поки файл вантажиться, зберігати рано: запит пішов би без нього.
  const canSave = canSaveEdit(request, form) && !files.busy;
  const tooShort = text.trim().length < REQUEST_TEXT_MIN;

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateActiveRequest(request.id, draftFromForm(form, request.tags, tagLabel));
      onSaved();
      onClose();
    } catch (reason) {
      setConfirmClose(false);
      setError(reason instanceof ApiError ? reason.message : "Не вдалося зберегти запит. Спробуйте ще раз.");
      setBusy(false);
    }
  };

  /** Escape, «←» і «Скасувати»: без змін закриваємо одразу, зі змінами питаємо. */
  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  /** «Вийти без збереження»: файли, завантажені в цій формі, але не збережені, стираємо з R2. */
  const leave = () => {
    files.discardFresh();
    onClose();
  };

  return { text, setText, params, setParams, files, tags, busy, error, dirty, canSave, tooShort, textValid: editTextValid(text), confirmClose, setConfirmClose, save, requestClose, onLeave: leave, filesFull: files.items.length >= REQUEST_FILES_MAX };
};
