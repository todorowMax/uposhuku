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

/** Виконавець стоїть у своєму місті, а не за точною адресою. */
export interface Performer extends GeoPoint {
  id: string;
  cityId: string;
  online: boolean;
  /** Лише візуальний рівень оплаченого розміщення в демо. */
  placement: "standard" | "plus" | "featured";
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
