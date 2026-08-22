-- 0011: drop never-used tables from the LumaPush feature import.
-- `campaign_variants`: A/B variants shipped via campaigns.variants_json instead.
-- `frequency_caps`: fatigue shield ships via indexed events counting instead.
-- Both had zero application read/write paths (verified by repo-wide grep).
-- Kept: subscriber_tags (read by the segment compiler's tag conditions).

DROP TABLE IF EXISTS `campaign_variants`;
DROP TABLE IF EXISTS `frequency_caps`;
