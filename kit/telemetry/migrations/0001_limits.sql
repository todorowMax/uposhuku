-- Лічильники для захисту від залпів: помилки з браузера, пачки подій.
-- key: що рахуємо ("err:ip:<hash>", "ev:ip:<hash>"); window: номер вікна (час / довжина вікна).
CREATE TABLE IF NOT EXISTS kit_limits (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);
