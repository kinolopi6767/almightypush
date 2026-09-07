=== PushPanel — push on publish ===
Contributors: pushpanel
Tags: push notifications, web push, webhook
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPLv2 or later

Fires a PushPanel push_on_publish automation webhook whenever a post, page or custom post type is published.

== Description ==

Connects your WordPress site to a self-hosted PushPanel instance. When you
publish a post, page or custom post type, the plugin signs a webhook request with the automation secret
and PushPanel fans out a push notification to your subscribers.

No API keys, no external services — just the webhook URL and secret shown on
the automation card in your PushPanel dashboard.

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/` and activate it.
2. In the PushPanel dashboard create a **push_on_publish** automation.
3. Copy the automation's **webhook URL** and **secret**.
4. Go to *Settings → PushPanel* in WordPress, paste both values, save.

== Changelog ==

= 0.2.0 =
* transition_post_status → fires for posts, pages and public custom post types (publish_post missed pages/CPTs).
* New: configurable delay (WP-Cron) and post-type checkboxes in Settings → PushPanel.
* New: one automatic retry after 5 minutes on 5xx/network failure; 4xx never retried.
* Only first-time publishes fire — updates to already-published content are ignored.

= 0.1.0 =
* Initial release: publish_post → HMAC-signed webhook.
