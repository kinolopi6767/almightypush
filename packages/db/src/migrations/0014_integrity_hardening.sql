-- 0014: integrity hardening (idempotent).
-- non_clickers resend joins events(delivery_id); previously only the partial
-- unique for clicked rows existed — the join probe needs a plain index.
-- Email contacts + subscriber tags duplicated without bounds (N sends per
-- address); invite tokens must be unique for single-use security.

CREATE INDEX IF NOT EXISTS idx_events_delivery_id ON events (delivery_id);

-- Dedupe before adding UNIQUEs (existing personal DBs may already hold dupes).
-- Keep the NEWEST row per key so a later corrected value/status survives.
DELETE FROM email_contacts WHERE id NOT IN (SELECT MAX(id) FROM email_contacts GROUP BY workspace_id, email);
DELETE FROM subscriber_tags WHERE id NOT IN (SELECT MAX(id) FROM subscriber_tags GROUP BY subscriber_id, tag);
-- team_invites could also hold duplicate hashes on upgraded DBs; without this
-- the UNIQUE below aborts the whole migration transaction (and every boot).
DELETE FROM team_invites WHERE id NOT IN (SELECT MAX(id) FROM team_invites GROUP BY token_hash);

-- Dedupe email contacts per workspace (case handling stays in app code;
-- index guards exact duplicates). NULL-safe: SQLite treats NULLs distinct.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_contacts_ws_email_uniq ON email_contacts (workspace_id, email);

-- One value per (subscriber, tag): setTags replace-all stays idempotent and
-- personalization reads stay deterministic.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriber_tags_sub_tag_uniq ON subscriber_tags (subscriber_id, tag);

-- Single-use invite tokens must be globally unique (stored as sha256 hash).
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_token_uniq ON team_invites (token_hash);
