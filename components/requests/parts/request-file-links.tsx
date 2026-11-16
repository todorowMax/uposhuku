import { FileText } from "@/components/icons";
import { formatFileSize } from "@/lib/requests/file-types";
import { requestFileUrl, type RequestFile } from "@/lib/requests/types";

export namespace RequestFileLinksTypes {
  export type Props = {
    files: RequestFile[];
    /** Рівень підпису для людини, що читає: «Файли запиту». */
    label?: string;
  };
}

/**
 * Файли запиту для того, хто його читає (виконавець у стрічці й на карті, автор у деталях). Посилання веде на
 * `/api/request-files/<id>`: сервер перевіряє доступ, зображення відкриваються у вкладці, решта завантажується.
 * Старий запис без файла (`stored: false`) показуємо назвою без посилання.
 */
export const RequestFileLinks = ({ files, label = "Файли запиту" }: RequestFileLinksTypes.Props) => {
  if (files.length === 0) return null;
  return (
    <div className="mt-2.5">
      <p className="text-xs font-semibold text-ink-muted">
        {label}: {files.length}
      </p>
      <ul className="mt-1 grid gap-1" aria-label={label}>
        {files.map((file) => (
          <li key={file.id} className="flex min-w-0 items-center gap-2 text-sm text-ink">
            <FileText className="size-4 shrink-0 text-ink-muted" aria-hidden />
            {file.stored ? (
              <a href={requestFileUrl(file.id)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline underline-offset-4 hover:text-brand">
                {file.name}
              </a>
            ) : (
              <span className="min-w-0 truncate">{file.name}</span>
            )}
            <span className="shrink-0 text-xs text-ink-muted">{file.stored ? formatFileSize(file.size) : "вміст не збережено"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
