CREATE INDEX IF NOT EXISTS `idx_deliveries_status_next` ON `deliveries` (`status`, `next_attempt_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_events_subscriber_type` ON `events` (`subscriber_id`, `type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_events_type_ts` ON `events` (`type`, `ts`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_subscribers_timezone` ON `subscribers` (`timezone`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_email_contacts_status` ON `email_contacts` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_journeys_next` ON `journeys` (`status`, `next_run_at`);--> statement-breakpoint
