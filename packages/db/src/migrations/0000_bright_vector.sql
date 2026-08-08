CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`domain_id` integer,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`scope_json` text DEFAULT '{}' NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_api_keys_ws` ON `api_keys` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` integer,
	`meta_json` text,
	`ts` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_audit_ws_ts` ON `audit_log` (`workspace_id`,`ts`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`location` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer,
	`email` text NOT NULL,
	`name` text,
	`password_hash` text,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`capabilities_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);--> statement-breakpoint
CREATE TABLE `automations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`domain_id` integer,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`audience_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_automations_next` ON `automations` (`status`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`domain_id` integer,
	`title` text NOT NULL,
	`message` text,
	`icon_url` text,
	`image_url` text,
	`launch_url` text,
	`buttons_json` text,
	`audience_json` text DEFAULT '{}' NOT NULL,
	`schedule_at` text,
	`schedule_tz` text,
	`scheduled` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source` text DEFAULT 'panel' NOT NULL,
	`template_id` integer,
	`stats_json` text DEFAULT '{}' NOT NULL,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_campaigns_ws` ON `campaigns` (`workspace_id`,`status`,`sent_at`);--> statement-breakpoint
CREATE TABLE `lp_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`domain_id` integer,
	`code` text NOT NULL,
	`target_url` text NOT NULL,
	`prompt_text` text,
	`force_subscribe` integer DEFAULT 0 NOT NULL,
	`clicks_count` integer DEFAULT 0 NOT NULL,
	`subscribers_count` integer DEFAULT 0 NOT NULL,
	`deleted_target_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lp_links_code_unique` ON `lp_links` (`code`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`domain_ids_json` text,
	`name` text NOT NULL,
	`conditions_json` text DEFAULT '[]' NOT NULL,
	`estimate_count` integer,
	`estimate_at` text,
	`last_used_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`message` text,
	`icon_url` text,
	`image_url` text,
	`launch_url` text,
	`buttons_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `youtube_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`domain_id` integer,
	`title` text,
	`channel_url` text NOT NULL,
	`feed_url` text,
	`prompt_text` text,
	`force_subscribe` integer DEFAULT 0 NOT NULL,
	`lp_code` text,
	`clicks_count` integer DEFAULT 0 NOT NULL,
	`desktop_subs` integer DEFAULT 0 NOT NULL,
	`mobile_subs` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_video_at` text,
	`last_polled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`subscriber_id` integer,
	`domain_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`error` text,
	`provider_msg` text,
	`requested_at` integer,
	`sent_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_deliv_camp_status` ON `deliveries` (`campaign_id`,`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `idx_deliv_domain` ON `deliveries` (`domain_id`,`status`);--> statement-breakpoint
CREATE TABLE `domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`name` text NOT NULL,
	`provider` text DEFAULT 'vapid' NOT NULL,
	`provider_config_json` text,
	`app_config_json` text,
	`status` text DEFAULT 'active' NOT NULL,
	`subscribers_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_domains_ws_name` ON `domains` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain_id` integer NOT NULL,
	`campaign_id` integer,
	`subscriber_id` integer,
	`type` text NOT NULL,
	`meta_json` text,
	`ts` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_domain_ts` ON `events` (`domain_id`,`ts`);--> statement-breakpoint
CREATE INDEX `idx_events_camp` ON `events` (`campaign_id`,`type`);--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain_id` integer NOT NULL,
	`token` text,
	`token_hash` text NOT NULL,
	`provider` text DEFAULT 'vapid' NOT NULL,
	`device` text,
	`os` text,
	`browser` text,
	`country` text,
	`state` text,
	`subscribe_url` text,
	`subscribe_at` text,
	`last_active_at` text,
	`unsubscribed_at` text,
	`unsub_reason` text,
	`meta_json` text,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_subs_domain` ON `subscribers` (`domain_id`,`unsubscribed_at`);--> statement-breakpoint
CREATE INDEX `idx_subs_domain_date` ON `subscribers` (`domain_id`,`subscribe_at`);--> statement-breakpoint
CREATE INDEX `idx_subs_domain_geo` ON `subscribers` (`domain_id`,`country`,`state`);--> statement-breakpoint
CREATE INDEX `idx_subs_domain_dev` ON `subscribers` (`domain_id`,`device`,`browser`,`os`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subs_active_token` ON `subscribers` (`domain_id`,`token_hash`) WHERE unsubscribed_at IS NULL;