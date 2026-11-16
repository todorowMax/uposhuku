"use client";

// components/composer/use-request-files.ts
//
// Файли запиту у формі: вибір, завантаження в R2 одразу після вибору, помилка, прибирання. Спільний для поля нового
// запиту й екрана «Редагувати запит». У чернетку йдуть лише id готових файлів (`files`); поки щось вантажиться, `busy`.

import { useRef, useState, type ChangeEvent } from "react";
import { discardRequestFile, uploadRequestFile } from "@/lib/requests/files-client";
import { REQUEST_FILES_MAX } from "@/lib/requests/file-types";
import type { RequestFile } from "@/lib/requests/types";

export namespace RequestFilesTypes {
  export type Item = {
    key: string;
    name: string;
    size: number;
    state: "uploading" | "ready" | "error";
    /** Опис із сервера, коли файл уже в R2. */
    file: RequestFile | null;
    error: string | null;
    /** Завантажений у цій формі (ще не збережений у запиті): його можна одразу стерти з R2. */
    fresh: boolean;
  };
}

const fromSaved = (file: RequestFile): RequestFilesTypes.Item => ({ key: `saved-${file.id}`, name: file.name, size: file.size, state: "ready", file, error: null, fresh: false });

export const useRequestFiles = (initial: RequestFile[] = []) => {
  const [items, setItems] = useState<RequestFilesTypes.Item[]>(() => initial.map(fromSaved));
  const [notice, setNotice] = useState<string | null>(null);
  const counter = useRef(0);

  const patch = (key: string, change: Partial<RequestFilesTypes.Item>) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));

  const add = async (picked: File[]) => {
    const room = Math.max(0, REQUEST_FILES_MAX - items.length);
    setNotice(picked.length > room ? `До ${REQUEST_FILES_MAX} файлів у запиті.` : null);
    for (const file of picked.slice(0, room)) {
      const key = `new-${counter.current++}`;
      setItems((current) => [...current, { key, name: file.name, size: file.size, state: "uploading", file: null, error: null, fresh: true }]);
      try {
        const saved = await uploadRequestFile(file);
        patch(key, { state: "ready", file: saved, name: saved.name, size: saved.size });
      } catch (reason) {
        patch(key, { state: "error", error: reason instanceof Error && reason.message ? reason.message : "Не вдалося завантажити файл." });
      }
    }
  };

  /** Обробник `onChange` прихованого поля вибору: беремо файли й чистимо поле, щоб той самий файл можна було вибрати знову. */
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = "";
    void add(picked);
  };

  const remove = (key: string) => {
    const gone = items.find((item) => item.key === key);
    setItems((current) => current.filter((item) => item.key !== key));
    setNotice(null);
    if (gone?.fresh && gone.file) void discardRequestFile(gone.file.id);
  };

  /** Файли, які людина додала в цій формі, але покинула без збереження: прибираємо з R2. */
  const discardFresh = () => {
    for (const item of items) if (item.fresh && item.file) void discardRequestFile(item.file.id);
  };

  const reset = () => {
    setItems([]);
    setNotice(null);
  };

  const files = items.flatMap((item) => (item.state === "ready" && item.file ? [item.file] : []));
  return { items, files, notice, busy: items.some((item) => item.state === "uploading"), pick, remove, discardFresh, reset };
};
