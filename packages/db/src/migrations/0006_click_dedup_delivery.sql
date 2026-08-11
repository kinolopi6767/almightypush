ALTER TABLE `events` ADD `delivery_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_clicked_delivery` ON `events` (`delivery_id`) WHERE `type` = 'clicked' AND `delivery_id` IS NOT NULL;
