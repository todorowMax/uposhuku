"use client";

import { useRef, type ChangeEvent } from "react";
import { Paperclip } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { REQUEST_FILE_ACCEPT } from "@/lib/requests/file-types";

export namespace FilePickerButtonTypes {
  export type Props = {
    onPick: (event: ChangeEvent<HTMLInputElement>) => void;
    /** Порядок Tab: -1, поки ряд дій поля ще виїжджає й недоступний. */
    tabIndex?: number;
  };
}

/** Скріпка в нижньому ряду поля запиту: відкриває вибір файлів (зображення, PDF, документи, текст і код). */
export const FilePickerButton = ({ onPick, tabIndex }: FilePickerButtonTypes.Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <FileInput ref={inputRef} multiple accept={REQUEST_FILE_ACCEPT} onChange={onPick} />
      <Button variant="icon" className="composer-attach" tabIndex={tabIndex} aria-label="Додати файл, зображення або код" onClick={() => inputRef.current?.click()}>
        <Paperclip className="size-4" aria-hidden />
      </Button>
    </>
  );
};
