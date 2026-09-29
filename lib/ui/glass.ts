// lib/ui/glass.ts
//
// Чи вмикати «скло» (backdrop-filter) під полем запиту. Під ним карта,
// що перемальовується постійно, тож розмиття рахується щокадру. Chromium
// робить це на GPU дешево; у Safari й Firefox на слабких пристроях воно
// помітно гальмує, тому там поле просто майже непрозоре.

type NavigatorHints = Navigator & {
  userAgentData?: { brands?: { brand: string }[] };
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

export const shouldUseGlass = (nav: NavigatorHints = navigator): boolean => {
  const chromium = nav.userAgentData?.brands?.some(({ brand }) => brand === "Chromium") ?? false;
  if (!chromium) return false;
  if (nav.connection?.saveData) return false;
  // deviceMemory округлений браузером (0.25…8 ГБ); невідомо — вважаємо нормальним.
  if ((nav.deviceMemory ?? 8) < 4) return false;
  if ((nav.hardwareConcurrency ?? 8) < 4) return false;
  return true;
};

/** Ставить <html data-glass>, CSS далі сам вмикає розмиття. */
export const applyGlassPreference = () => {
  if (shouldUseGlass()) document.documentElement.dataset.glass = "";
  else delete document.documentElement.dataset.glass;
};
