// lib/requests/file-types.ts
//
// Які файли можна прикріпити до запиту. Чиста логіка без R2 й D1: спільна для сервера (перевірка байтів) і для
// клієнта (атрибут `accept`, підписи розміру). Тип визначаємо за розширенням ТА за першими байтами, а не за тим, що
// сказав браузер у `Content-Type`; SVG, HTML та виконувані файли не приймаємо.

/** Скільки важить один файл. Тіло йде в пам'ять воркера, тому стеля помірна. */
export const REQUEST_FILE_MAX_BYTES = 8_000_000;
/** Файлів у запиті (збігається зі стелею `parseDraft`). */
export const REQUEST_FILES_MAX = 10;
/** Усі файли одного запиту разом. */
export const REQUEST_FILES_TOTAL_BYTES = 25_000_000;
/** Скільки завантажених, але ще не прикріплених до збереженого запиту файлів може мати людина. */
export const REQUEST_FILES_PENDING_MAX = 20;
/** Через скільки не прикріплений файл вважаємо осиротілим. */
export const REQUEST_FILE_ORPHAN_MS = 24 * 60 * 60 * 1000;

export type RequestFileKind = "image" | "document" | "text";

export interface DetectedFile {
  /** Тип, який ми зберігаємо й віддаємо; не клієнтський. */
  mime: string;
  ext: string;
  kind: RequestFileKind;
}

const startsWith = (bytes: Uint8Array, signature: number[]) => bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);

const IS_JPEG = (bytes: Uint8Array) => startsWith(bytes, [0xff, 0xd8, 0xff]);
const IS_PNG = (bytes: Uint8Array) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IS_GIF = (bytes: Uint8Array) => startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
const IS_WEBP = (bytes: Uint8Array) => startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length > 11 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
const IS_PDF = (bytes: Uint8Array) => startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
/** ZIP (а з ним docx, xlsx, pptx): локальний заголовок файла. */
const IS_ZIP = (bytes: Uint8Array) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);

interface Binary {
  mime: string;
  kind: RequestFileKind;
  matches: (bytes: Uint8Array) => boolean;
}

const OFFICE = (mime: string): Binary => ({ mime, kind: "document", matches: IS_ZIP });

/** Двійкові формати: розширення й перші байти мають збігатися. */
const BINARY: Record<string, Binary> = {
  jpg: { mime: "image/jpeg", kind: "image", matches: IS_JPEG },
  jpeg: { mime: "image/jpeg", kind: "image", matches: IS_JPEG },
  png: { mime: "image/png", kind: "image", matches: IS_PNG },
  gif: { mime: "image/gif", kind: "image", matches: IS_GIF },
  webp: { mime: "image/webp", kind: "image", matches: IS_WEBP },
  pdf: { mime: "application/pdf", kind: "document", matches: IS_PDF },
  zip: OFFICE("application/zip"),
  docx: OFFICE("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  xlsx: OFFICE("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  pptx: OFFICE("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
};

/** Текст і код: віддаємо завжди як `text/plain` із завантаженням, тож скрипт у такому файлі не виконається. */
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log", "js", "ts", "tsx", "jsx", "py", "php", "css", "scss", "sql", "yml", "yaml", "toml", "java", "go", "rs", "rb", "c", "cpp", "h", "cs", "kt", "swift", "sh"]);

/** Значення атрибута `accept` для вибору файла: розширення з білого списку. */
export const REQUEST_FILE_ACCEPT = [...Object.keys(BINARY), ...TEXT_EXTENSIONS].map((ext) => `.${ext}`).join(",");

const TEXT_PROBE_BYTES = 8192;

/** Чи схожий вміст на текст у UTF-8: без нульових байтів і без пошкоджених послідовностей. */
const looksLikeText = (bytes: Uint8Array): boolean => {
  if (bytes.subarray(0, TEXT_PROBE_BYTES).includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};

/** Розширення в нижньому регістрі без крапки; порожньо, якщо його нема. */
export const fileExtension = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
};

/** Ім'я для показу: без шляху й керівних символів, не довше 120 знаків; порожнє стає «файл». */
export const sanitizeFileName = (raw: string): string => {
  const last = raw.split(/[\\/]/).pop() ?? "";
  const base = [...last]
    .filter((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127 && !'<>:"|?*'.includes(char))
    .join("")
    .trim();
  const ext = fileExtension(base);
  const name = base.length > 120 ? `${base.slice(0, ext ? 119 - ext.length : 120)}${ext ? `.${ext}` : ""}` : base;
  return name === "" || name.startsWith(".") ? `файл${name}` : name;
};

/**
 * Тип файла з білого списку або null. Розширення мусить бути дозволеним, а вміст відповідати йому:
 * `evil.exe` і `photo.jpg` з чужим вмістом відхиляються.
 */
export const detectRequestFile = (name: string, bytes: Uint8Array): DetectedFile | null => {
  const ext = fileExtension(name);
  const binary = BINARY[ext];
  if (binary) return binary.matches(bytes) ? { mime: binary.mime, ext, kind: binary.kind } : null;
  if (TEXT_EXTENSIONS.has(ext) && looksLikeText(bytes)) return { mime: "text/plain; charset=utf-8", ext, kind: "text" };
  return null;
};

/** Розмір для людини: «820 Б», «1,4 КБ», «3,2 МБ». */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1000) return `${bytes} Б`;
  const format = (value: number) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(value);
  return bytes < 1_000_000 ? `${format(bytes / 1000)} КБ` : `${format(bytes / 1_000_000)} МБ`;
};
