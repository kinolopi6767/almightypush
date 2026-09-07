-- 0015: drop dead `sessions` table (idempotent).
-- Auth.js runs JWT strategy (stateless sessions in signed cookies) — no code
-- path has ever read or written this table (verified by repo-wide grep).
-- Precedent: 0011 dropped other never-used LumaPush-import tables the same way.
-- Keeping it would mislead future contributors into building a DB-session
-- flow against a table that migrations-created but nothing maintains.

DROP TABLE IF EXISTS `sessions`;
