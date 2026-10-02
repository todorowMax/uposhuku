// lib/map/types.ts

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface City extends GeoPoint {
  id: string;
  name: string;
  /** Підписувати на карті країни. Решту міст видно лише за маркерами. */
  label: boolean;
  /** З якого боку від купки маркерів стоїть підпис, щоб не наїжджати на сусідів. */
  labelSide?: "left" | "right";
}

export type PlacementTier = 1 | 2 | 3 | 4 | 5 | 6;

/** Який це проєкт: від цього залежить мініатюра, поки немає справжніх скриншотів. */
export type WorkKind = "site" | "app" | "bot" | "dashboard" | "design";

export interface PortfolioWork {
  id: string;
  title: string;
  kind: WorkKind;
  /** Відтінок мініатюри, 0–360: сусідні роботи різного кольору. */
  hue: number;
  /** Що зроблено й для кого: пише сама людина, у профілі видно під мініатюрою. */
  description?: string;
  /** Посилання на живий проєкт. */
  url?: string;
  /** Теги роботи: підтверджують навички з профілю. */
  tags?: string[];
}

/** Виконавець стоїть у своєму місті, а не за точною адресою. */
export interface Performer extends GeoPoint {
  id: string;
  cityId: string;
  online: boolean;
  /**
   * Рівень оплаченого розміщення, 1–6: хто більше заплатив, у того більший
   * портрет і він вище в списку. Лише розмір, без «зірочок» і рамок.
   */
  tier: PlacementTier;
  /** Теги профілю: що людина робить. По них карта відсіює виконавців під запит. */
  tags: string[];
  /** «Про себе»: людина пише сама, у картці видно перші три рядки. */
  bio: string;
  /** Роботи в портфоліо, у картці — горизонтальною стрічкою. */
  works: PortfolioWork[];
  /** Фото, яке людина завантажила (data URL); без нього — обличчя з атласу за avatarIndex. */
  photo?: string;
  /** Профіль поточної людини: картка показує «Редагувати» замість «Запропонувати роботу». */
  mine?: boolean;
  /** Позиція портрета в локальному атласі 4×4. */
  avatarIndex: number;
  name: string;
  specialty: string;
}

/** Запит: «що потрібно створити», теж з точністю до міста. */
export interface WorkRequest extends GeoPoint {
  id: string;
  cityId: string;
  /** Свіжий запит: пульсує й тягне дуги до виконавців. */
  live: boolean;
}

export interface Match {
  requestId: string;
  performerId: string;
}
