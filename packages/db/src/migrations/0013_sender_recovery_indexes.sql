-- 0013: sender crash-recovery + fatigue-counter coverage (idempotent).
-- The stale-claim revive filters (status, claimed_at) with no leading index,
-- so every send cycle scans the whole `sending` set (large after a crash).
-- Per-subscriber delivery history has no index at all (SQLite does not
-- auto-index FK columns). The fatigue counters range-filter ts per
-- (subscriber_id, type) on EVERY delivery — without the trailing ts column
-- each send scans 30 days of that subscriber's delivered rows.

CREATE INDEX IF NOT EXISTS idx_deliveries_status_claimed ON deliveries (status, claimed_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_subscriber ON deliveries (subscriber_id);
CREATE INDEX IF NOT EXISTS idx_events_subscriber_type_ts ON events (subscriber_id, type, ts);
