-- Журнал помилок і службових подій: рядок на кожен випадок.
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  level TEXT NOT NULL,            -- error | warn | info
  source TEXT NOT NULL,           -- client | server | worker
  event TEXT NOT NULL,            -- короткий код: unhandled_error, api_error, telegram_send_failed
  message TEXT NOT NULL DEFAULT '',
  detail TEXT,                    -- JSON, до 4000 символів (до 12000 за явним detailMax)
  fingerprint TEXT NOT NULL,
  user_id TEXT,
  anon_id TEXT,
  session_id TEXT,
  ip_hash TEXT,                   -- SHA-256 від IP з сіллю, сам IP не зберігаємо
  route TEXT,
  release TEXT,
  env TEXT,
  user_agent TEXT,
  country TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs (created_at);
CREATE INDEX IF NOT EXISTS idx_logs_fp ON logs (fingerprint, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_event ON logs (event, created_at);

-- Групи однакових помилок: те, що в Sentry називається issue.
CREATE TABLE IF NOT EXISTS log_issues (
  fingerprint TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  level TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',   -- open | resolved | ignored
  resolved_release TEXT,
  last_release TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_issues_status ON log_issues (status, last_seen);
