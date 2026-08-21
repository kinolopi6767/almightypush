ALTER TABLE `subscribers` ADD `city` text;--> statement-breakpoint
ALTER TABLE `subscribers` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `subscribers` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `subscribers` ADD `screen_width` integer;--> statement-breakpoint
ALTER TABLE `subscribers` ADD `screen_height` integer;--> statement-breakpoint
CREATE INDEX `idx_subs_domain_city` ON `subscribers` (`domain_id`,`city`);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `channel` text DEFAULT 'push' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `variants_json` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `topic` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ttl` integer DEFAULT 86400 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `urgency` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_campaigns_channel` ON `campaigns` (`channel`);
