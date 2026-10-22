// kit/telemetry/client/config.ts
//
// Налаштування клієнтської частини. Застосунок задає їх один раз
// (`<Telemetry/>` викликає `configureClient`), решта модулів читає.

export interface TelemetryClientConfig {
  /** Куди слати помилки. */
  reportUrl: string;
  /** Куди слати пачки подій. */
  ingestUrl: string;
  /** Префікс ключів localStorage/sessionStorage, щоб застосунки не плутали свої. */
  storagePrefix: string;
}

let current: TelemetryClientConfig = { reportUrl: "/api/k/r", ingestUrl: "/api/k/e", storagePrefix: "kit" };

export const configureClient = (config: Partial<TelemetryClientConfig>): void => {
  current = { ...current, ...config };
};

export const clientConfig = (): TelemetryClientConfig => current;

/** Читання/запис сховища, який не падає: приватний режим Safari вміє кидати. */
export const safeStorage = (kind: "local" | "session") => {
  const get = (): Storage | null => {
    try {
      return kind === "local" ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    read(key: string): string | null {
      try {
        return get()?.getItem(`${current.storagePrefix}:${key}`) ?? null;
      } catch {
        return null;
      }
    },
    write(key: string, value: string): void {
      try {
        get()?.setItem(`${current.storagePrefix}:${key}`, value);
      } catch {
        // Не вдалося запам'ятати: нічого страшного.
      }
    },
    remove(key: string): void {
      try {
        get()?.removeItem(`${current.storagePrefix}:${key}`);
      } catch {
        // Те саме.
      }
    },
  };
};
