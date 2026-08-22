-- 0010: final-audit performance + hygiene indexes (idempotent).
-- Hot-path coverage found missing during the release audit:
--   * api_keys.token_hash      — auth lookup on EVERY /api/v1 request
--   * campaigns(status, schedule_at) — polled by the worker every tick
-- Also drops the duplicate unique index on users.email (drizzle emits
-- `users_email_unique` from the column constraint; `idx_users_email` was a
-- second, redundant explicit index).

CREATE INDEX IF NOT EXISTS idx_api_keys_token ON api_keys (token_hash);
CREATE INDEX IF NOT EXISTS idx_campaigns_status_sched ON campaigns (status, schedule_at);
DROP INDEX IF EXISTS idx_users_email;
