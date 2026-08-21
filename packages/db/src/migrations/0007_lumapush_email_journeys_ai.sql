CREATE TABLE `email_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`attrs_json` text DEFAULT '{}' NOT NULL,
	`subscribe_at` text,
	`last_open_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_email_contacts_ws` ON `email_contacts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_email_contacts_ws_email` ON `email_contacts` (`workspace_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_email_contacts_status` ON `email_contacts` (`status`);--> statement-breakpoint
CREATE TABLE `email_sending_domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`domain` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`spf_verified` integer DEFAULT 0 NOT NULL,
	`dkim_verified` integer DEFAULT 0 NOT NULL,
	`dmarc_verified` integer DEFAULT 0 NOT NULL,
	`selector` text DEFAULT 'luma' NOT NULL,
	`dkim_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_email_domains_ws` ON `email_sending_domains` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `email_campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`subject` text NOT NULL,
	`preheader` text,
	`html` text,
	`blocks_json` text,
	`from_domain_id` integer,
	`from_email` text,
	`audience_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`schedule_at` text,
	`stats_json` text DEFAULT '{}' NOT NULL,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_domain_id`) REFERENCES `email_sending_domains`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_email_campaigns_ws` ON `email_campaigns` (`workspace_id`,`status`,`sent_at`);--> statement-breakpoint
CREATE TABLE `campaign_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`channel` text DEFAULT 'push' NOT NULL,
	`variant_key` text NOT NULL,
	`title` text,
	`message` text,
	`image_url` text,
	`html` text,
	`subject` text,
	`weight` integer DEFAULT 50 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_variants_camp` ON `campaign_variants` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_variants_channel` ON `campaign_variants` (`channel`);--> statement-breakpoint
CREATE TABLE `subscriber_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscriber_id` integer NOT NULL,
	`tag` text NOT NULL,
	`value` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subscriber_tags_sub` ON `subscriber_tags` (`subscriber_id`);--> statement-breakpoint
CREATE INDEX `idx_subscriber_tags_tag` ON `subscriber_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`domain_id` integer,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`canvas_json` text DEFAULT '{}' NOT NULL,
	`trigger_type` text DEFAULT 'subscribe' NOT NULL,
	`trigger_config_json` text DEFAULT '{}' NOT NULL,
	`stats_json` text DEFAULT '{}' NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_journeys_ws_status` ON `journeys` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `journey_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`journey_id` integer NOT NULL,
	`subscriber_id` integer,
	`email_contact_id` integer,
	`status` text DEFAULT 'awaiting' NOT NULL,
	`step_id` text,
	`detail` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_journey_runs_journey` ON `journey_runs` (`journey_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`kind` text NOT NULL,
	`prompt` text,
	`input_json` text,
	`output_json` text,
	`model` text,
	`tokens` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ai_gen_ws_kind` ON `ai_generations` (`workspace_id`,`kind`);--> statement-breakpoint
CREATE TABLE `frequency_caps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`subscriber_id` integer,
	`email_contact_id` integer,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`last_sent_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_freq_caps_ws_day` ON `frequency_caps` (`workspace_id`,`day`);--> statement-breakpoint
CREATE INDEX `idx_freq_caps_sub_day` ON `frequency_caps` (`subscriber_id`,`day`);--> statement-breakpoint
CREATE TABLE `team_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text,
	`accepted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_team_invites_ws` ON `team_invites` (`workspace_id`);
