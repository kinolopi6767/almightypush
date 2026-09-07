-- 0016: covering indexes for retention pruning + terminated-campaign scan.
-- runRetentionPruning filters deliveries by (status, requested_at) for
-- stranded queued/sending rows and (status, sent_at) for terminal rows —
-- neither predicate had a covering index, so the daily prune scanned.
-- cancelTerminatedCampaignDeliveries filters campaigns by status every tick.

CREATE INDEX IF NOT EXISTS idx_deliveries_status_requested ON deliveries (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_status_sent ON deliveries (status, sent_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
