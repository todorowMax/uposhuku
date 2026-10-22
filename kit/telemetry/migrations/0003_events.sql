-- Аналітика: подія на рядок. Жодних вільних текстів, лише назва й прості властивості.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,            -- uuid з браузера: повторна відправка не задвоює (INSERT OR IGNORE)
  ts INTEGER NOT NULL,            -- час події, поправлений на зсув годинника клієнта
  received_at INTEGER NOT NULL,
  name TEXT NOT NULL,
  props TEXT,                     -- JSON: до 15 ключів, рядки до 100 символів, числа, булеві
  source TEXT NOT NULL,           -- client | server
  user_id TEXT,                   -- лише із сесії, ніколи з тіла запиту
  anon_id TEXT,                   -- null, поки немає згоди
  session_id TEXT NOT NULL,       -- 'server' для серверних подій
  path TEXT,
  referrer TEXT,                  -- лише домен
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  country TEXT,
  internal INTEGER NOT NULL DEFAULT 0,
  release TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_name_ts ON events (name, ts);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_user ON events (user_id, ts);
