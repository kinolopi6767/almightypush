-- 0012: retention-prune + email-poller coverage (idempotent).
-- The daily retention job deletes deliveries by sent_at and events by ts —
-- both were full table scans holding SQLite's write lock for the whole
-- statement (web-side writes hit SQLITE_BUSY for the duration). The email
-- poller filters (status, schedule_at) with no leading index, and the
-- automation/journey run-history prunes scan created_at.

CREATE INDEX IF NOT EXISTS idx_deliveries_sent_at ON deliveries (sent_at);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_sched ON email_campaigns (status, schedule_at);
CREATE INDEX IF NOT EXISTS idx_automation_runs_created ON automation_runs (created_at);
CREATE INDEX IF NOT EXISTS idx_journey_runs_created ON journey_runs (created_at);
