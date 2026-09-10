-- 0017: integrity hardening II (idempotent).
--
-- (a) users.role DB default was 'owner' while the TS schema and the app's
--     least-privilege invariant promise 'viewer'. Drizzle inserts always bind
--     the column, so ORM writes looked safe — but any raw insert (sqlite3,
--     seed scripts, restore tooling, a future driver) that omitted `role`
--     minted an owner. Rebuild the table with DEFAULT 'viewer' and make the
--     email uniqueness case-insensitive (User@x == user@x).
-- (b) deliveries had no UNIQUE(campaign_id, subscriber_id): a retried
--     fan-out or duplicate enqueue call could double-push a subscriber.
--     Dedupe (prefer the most advanced status, then lowest id) then add the
--     index so enqueue can use ON CONFLICT DO NOTHING.
-- (c) automations.consecutive_failures was nullable in the DB (0004 added it
--     without NOT NULL) despite the notNull() TS schema. Backfill and force
--     non-NULL with triggers (a table rebuild would need foreign_keys=OFF,
--     which is impossible inside our migration transaction).
-- (d) Missing workspace-list indexes; drop four redundant indexes that are
--     prefixes of composite/unique indexes (pure write amplification).

-- (a) users rebuild ----------------------------------------------------------
UPDATE users SET email = lower(trim(email));
-- Preserve the oldest row per case-insensitive email (the bootstrap owner is
-- the first user, so MIN(id) keeps ownership intact in a dedupe edge case).
DELETE FROM users WHERE id NOT IN (SELECT MIN(id) FROM users GROUP BY lower(email));

CREATE TABLE `users_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer,
	`email` text NOT NULL COLLATE NOCASE,
	`name` text,
	`password_hash` text,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO `users_new` (`id`,`workspace_id`,`email`,`name`,`password_hash`,`totp_secret`,`totp_enabled`,`role`,`last_login_at`,`created_at`,`updated_at`)
SELECT `id`,`workspace_id`,`email`,`name`,`password_hash`,`totp_secret`,`totp_enabled`,`role`,`last_login_at`,`created_at`,`updated_at` FROM `users`;
DROP TABLE `users`;
ALTER TABLE `users_new` RENAME TO `users`;
CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);

-- (b) deliveries one-row-per-(campaign, subscriber) --------------------------
DELETE FROM deliveries WHERE subscriber_id IS NOT NULL AND id NOT IN (
	SELECT id FROM (
		SELECT id, ROW_NUMBER() OVER (
			PARTITION BY campaign_id, subscriber_id
			ORDER BY CASE status
				WHEN 'sent' THEN 0
				WHEN 'unsubscribed' THEN 1
				WHEN 'sending' THEN 2
				WHEN 'queued' THEN 3
				WHEN 'failed' THEN 4
				ELSE 5
			END, id
		) AS rn
		FROM deliveries
		WHERE subscriber_id IS NOT NULL
	) WHERE rn = 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_camp_sub ON deliveries (campaign_id, subscriber_id);

-- (c) automations.consecutive_failures never NULL ----------------------------
UPDATE automations SET consecutive_failures = 0 WHERE consecutive_failures IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_automations_failures_insert
AFTER INSERT ON automations
WHEN NEW.consecutive_failures IS NULL
BEGIN
	UPDATE automations SET consecutive_failures = 0 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_automations_failures_update
AFTER UPDATE OF consecutive_failures ON automations
WHEN NEW.consecutive_failures IS NULL
BEGIN
	UPDATE automations SET consecutive_failures = 0 WHERE id = NEW.id;
END;

-- (d) resumable campaign fan-out ---------------------------------------------
-- The scheduler claims scheduled→sending BEFORE inserting the audience in
-- chunks. A crash mid-fan-out left a partial audience that finalize would
-- treat as complete. This flag is set only after the whole audience is
-- enqueued; the reaper resumes any `sending` campaign with the flag unset.
-- Backfill terminal rows (their fan-out ended one way or another); in-flight
-- rows stay 0 and are resumed exactly once on upgrade.
ALTER TABLE campaigns ADD COLUMN audience_complete integer DEFAULT 0 NOT NULL;
UPDATE campaigns SET audience_complete = 1 WHERE status NOT IN ('sending');

-- (e) index hygiene ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_templates_ws ON templates (workspace_id);
CREATE INDEX IF NOT EXISTS idx_segments_ws ON segments (workspace_id);
CREATE INDEX IF NOT EXISTS idx_automations_ws ON automations (workspace_id);
CREATE INDEX IF NOT EXISTS idx_lp_links_ws ON lp_links (workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_youtube_channels_ws ON youtube_channels (workspace_id, status);

DROP INDEX IF EXISTS idx_email_contacts_ws_email;
DROP INDEX IF EXISTS idx_events_subscriber_type;
DROP INDEX IF EXISTS idx_campaigns_status;
DROP INDEX IF EXISTS idx_subscribers_timezone;
