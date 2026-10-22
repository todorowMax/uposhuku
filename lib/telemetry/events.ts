// lib/telemetry/events.ts
//
// Словник подій аналітики. Один файл на всі назви, щоб у звітах не з'явилося
// `request_sent`, `requestSend` і `send_request` як три різні воронки.
//
// Правила:
//  • snake_case; назва відповідає на «чи дійшла людина до цього кроку», а не
//    «що взагалі відбувалося»;
//  • у властивостях немає вільного тексту: лише ідентифікатори, лічильники,
//    прапорці й короткі коди. Винятки (нормалізований пошуковий запит у
//    tag_search_empty, фрагмент тексту в tag_removed) названо окремо, див. нижче;
//  • позначка «С» біля події: її шле сервер, бо це крок, який не має права
//    загубити блокувальник реклами.
export const EVENTS = {
  /* Карта. */
  mapReady: "map_ready",
  mapModeSwitched: "map_mode_switched",
  markerClicked: "marker_clicked",
  groupClicked: "group_clicked",
  performerProfileOpened: "performer_profile_opened",
  filterGroupToggled: "filter_group_toggled",
  filterCityToggled: "filter_city_toggled",
  filterOnlineToggled: "filter_online_toggled",
  filterTagToggled: "filter_tag_toggled",

  /* Замовник: від запиту до угоди. */
  composerFocused: "composer_focused",
  composerTagsDetected: "composer_tags_detected",
  requestSubmitClicked: "request_submit_clicked",
  authStarted: "auth_started",
  authCodeSent: "auth_code_sent",
  authCompleted: "auth_completed", // С
  authFailed: "auth_failed",
  requestPublished: "request_published", // С
  offerReceived: "offer_received", // С
  offersPanelOpened: "offers_panel_opened",
  offerRejected: "offer_rejected",
  chatOpened: "chat_opened",
  messageSent: "message_sent", // С
  dealCreated: "deal_created", // С
  dealAccepted: "deal_accepted", // С
  dealPaid: "deal_paid", // С
  dealCompleted: "deal_completed", // С
  reviewLeft: "review_left", // С

  /* Виконавець. */
  performerCtaClicked: "performer_cta_clicked",
  profileEditorOpened: "profile_editor_opened",
  profileSaved: "profile_saved", // С
  profilePublished: "profile_published", // С
  placementOpened: "placement_opened",
  placementTierSelected: "placement_tier_selected",
  placementPaid: "placement_paid", // С
  feedOpened: "feed_opened",
  responseSent: "response_sent", // С

  /* Теги. */
  tagPickerOpened: "tag_picker_opened",
  /** Єдиний виняток із «без вільного тексту»: `query`, нормалізований, до 40 символів, без контактів. */
  tagSearchEmpty: "tag_search_empty",
  tagPicked: "tag_picked",
  tagAdded: "tag_added",
  /** `phrase` для тегу з тексту: нормалізований фрагмент, з якого розпізнано, до 40 символів. */
  tagRemoved: "tag_removed",
  tagProposed: "tag_proposed", // С

  /* Сповіщення й Telegram. */
  pushEnabled: "push_enabled",
  notificationPrefsChanged: "notification_prefs_changed",
  telegramLinkStarted: "telegram_link_started",
  telegramLinked: "telegram_linked", // С
  telegramUnlinked: "telegram_unlinked", // С
  consentChosen: "consent_chosen",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Назви, які сервер приймає від браузера. `page_view` додає сам kit. */
export const ALLOWED_EVENTS: ReadonlySet<string> = new Set<string>([...Object.values(EVENTS), "page_view"]);
