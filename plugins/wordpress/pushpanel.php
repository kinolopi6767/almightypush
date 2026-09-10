<?php
/**
 * Plugin Name: PushPanel — push on publish
 * Description: Fires a PushPanel push_on_publish automation webhook whenever a post, page or custom post type is published.
 * Version: 0.3.0
 * Requires at least: 6.0
 * Tested up to: 6.8
 * Requires PHP: 7.4
 * Author: PushPanel
 * License: GPL-2.0-or-later
 *
 * Setup: Settings → PushPanel → paste the automation webhook URL and secret
 * (shown on the automation card in the PushPanel dashboard).
 */

if (!defined('ABSPATH')) exit;

define('PUSHPANEL_VERSION', '0.3.0');
define('PUSHPANEL_CRON_HOOK', 'pushpanel_delayed_fire');
define('PUSHPANEL_MAX_ATTEMPTS', 2);

add_action('admin_menu', 'pushpanel_admin_menu');
add_action('admin_init', 'pushpanel_register_settings');
// transition_post_status covers posts, pages AND custom post types in one
// hook — publish_post alone misses pages/CPTs (the most common reason the
// "push on publish" flow silently never fires on real sites).
add_action('transition_post_status', 'pushpanel_on_transition', 10, 3);
add_action(PUSHPANEL_CRON_HOOK, 'pushpanel_cron_fire', 10, 2);
// Serve /sw.js at the site root so the PushPanel SDK works without a manual
// file upload. Service workers must be same-origin with the page; a plugin
// rewrite + Service-Worker-Allowed header is the standard way to host one.
add_action('init', 'pushpanel_register_sw_route');
add_filter('query_vars', 'pushpanel_register_sw_query_var');
add_action('template_redirect', 'pushpanel_maybe_serve_sw');
register_activation_hook(__FILE__, 'pushpanel_activate');
register_deactivation_hook(__FILE__, 'pushpanel_deactivate');

function pushpanel_register_settings() {
  register_setting('pushpanel_settings', 'pushpanel_webhook_url', array('type' => 'string', 'sanitize_callback' => 'esc_url_raw'));
  register_setting('pushpanel_settings', 'pushpanel_webhook_secret', array('type' => 'string', 'sanitize_callback' => 'sanitize_text_field'));
  register_setting('pushpanel_settings', 'pushpanel_delay_seconds', array('type' => 'integer', 'sanitize_callback' => 'absint', 'default' => 0));
  register_setting('pushpanel_settings', 'pushpanel_panel_url', array('type' => 'string', 'sanitize_callback' => 'esc_url_raw'));
  register_setting('pushpanel_settings', 'pushpanel_post_types', array('type' => 'array', 'sanitize_callback' => 'pushpanel_sanitize_post_types', 'default' => array('post')));
}

function pushpanel_sanitize_post_types($value) {
  if (!is_array($value)) return array('post');
  $allowed = get_post_types(array('public' => true), 'names');
  $clean = array();
  foreach ($value as $t) {
    $t = sanitize_key($t);
    if (isset($allowed[$t])) $clean[] = $t;
  }
  return $clean ? array_values(array_unique($clean)) : array('post');
}

function pushpanel_activate() {
  pushpanel_register_sw_route();
  flush_rewrite_rules();
}

function pushpanel_deactivate() {
  flush_rewrite_rules();
}

/** Public panel base URL derived from the webhook URL (or the explicit option). */
function pushpanel_panel_base() {
  $base = get_option('pushpanel_panel_url');
  if (is_string($base) && $base !== '') return rtrim(esc_url_raw($base), '/');
  $url = get_option('pushpanel_webhook_url');
  if (!is_string($url) || $url === '') return '';
  $base = preg_replace('#/api/v1/automations/\d+/trigger/?$#', '', $url);
  return is_string($base) ? rtrim($base, '/') : '';
}

function pushpanel_register_sw_route() {
  add_rewrite_rule('^sw\.js$', 'index.php?pushpanel_sw=1', 'top');
}

function pushpanel_register_sw_query_var($vars) {
  $vars[] = 'pushpanel_sw';
  return $vars;
}

/**
 * Serve the panel's own service worker at /sw.js. Cached for an hour; served
 * with Service-Worker-Allowed so it can control the whole origin. When the
 * panel is unreachable (or no webhook is configured yet) a minimal no-op
 * worker is served so the SDK registration does not 404.
 */
function pushpanel_maybe_serve_sw() {
  if ((string) get_query_var('pushpanel_sw') !== '1') return;
  $src = get_transient('pushpanel_sw_source');
  if (!is_string($src) || $src === '') {
    $base = pushpanel_panel_base();
    if ($base) {
      $res = wp_remote_get($base . '/sw.js', array('timeout' => 5, 'redirection' => 2));
      if (!is_wp_error($res) && (int) wp_remote_retrieve_response_code($res) === 200) {
        $body = (string) wp_remote_retrieve_body($res);
        if ($body !== '' && strlen($body) <= 200000) {
          $src = $body;
          set_transient('pushpanel_sw_source', $src, HOUR_IN_SECONDS);
        }
      }
    }
  }
  if (!is_string($src) || $src === '') {
    $src = "/* PushPanel worker unavailable — panel not reachable. */\n";
  }
  header('Content-Type: application/javascript; charset=utf-8');
  header('Service-Worker-Allowed: /');
  header('Cache-Control: public, max-age=3600');
  echo $src; // phpcs:ignore WordPress.Security.EscapeOutput -- raw JS from the panel.
  exit;
}

function pushpanel_admin_menu() {
  add_options_page('PushPanel', 'PushPanel', 'manage_options', 'pushpanel', 'pushpanel_settings_page');
}

function pushpanel_settings_page() {
  $types = get_post_types(array('public' => true), 'objects');
  $enabled = get_option('pushpanel_post_types', array('post'));
  if (!is_array($enabled)) $enabled = array('post');
  ?>
  <div class="wrap">
    <h1>PushPanel</h1>
    <form method="post" action="options.php">
      <?php settings_fields('pushpanel_settings'); ?>
      <table class="form-table">
        <tr>
          <th><label for="pushpanel_webhook_url">Webhook URL</label></th>
          <td><input name="pushpanel_webhook_url" id="pushpanel_webhook_url" type="url" class="regular-text"
            value="<?php echo esc_attr(get_option('pushpanel_webhook_url')); ?>" placeholder="https://panel.example.com/api/v1/automations/12/trigger"></td>
        </tr>
        <tr>
          <th><label for="pushpanel_webhook_secret">Webhook secret</label></th>
          <td><input name="pushpanel_webhook_secret" id="pushpanel_webhook_secret" type="password" class="regular-text"
            value="<?php echo esc_attr(get_option('pushpanel_webhook_secret')); ?>" autocomplete="new-password">
            <p class="description">Stored in wp_options — restrict admin access on shared sites.</p></td>
        </tr>
        <tr>
          <th><label for="pushpanel_panel_url">Panel URL (optional)</label></th>
          <td><input name="pushpanel_panel_url" id="pushpanel_panel_url" type="url" class="regular-text"
            value="<?php echo esc_attr(get_option('pushpanel_panel_url')); ?>" placeholder="https://panel.example.com">
            <p class="description">Base URL of your PushPanel. Used to serve the push service worker at <code>/sw.js</code>; derived from the webhook URL when left blank.</p></td>
        </tr>
        <tr>
          <th><label for="pushpanel_delay_seconds">Delay (seconds)</label></th>
          <td><input name="pushpanel_delay_seconds" id="pushpanel_delay_seconds" type="number" min="0" max="86400" step="1" class="small-text"
            value="<?php echo esc_attr((string) absint(get_option('pushpanel_delay_seconds', 0))); ?>">
            <p class="description">Wait this long after publishing before firing (0 = immediate). Uses WP-Cron — requires site traffic or a system cron hitting wp-cron.php.</p></td>
        </tr>
        <tr>
          <th>Post types</th>
          <td>
            <?php foreach ($types as $slug => $obj) : ?>
              <label style="display:block;margin-bottom:4px;">
                <input type="checkbox" name="pushpanel_post_types[]" value="<?php echo esc_attr($slug); ?>"
                  <?php checked(in_array($slug, $enabled, true)); ?>>
                <?php echo esc_html($obj->labels->singular_name . " ($slug)"); ?>
              </label>
            <?php endforeach; ?>
          </td>
        </tr>
      </table>
      <?php submit_button(); ?>
    </form>
  </div>
  <?php
}

function pushpanel_on_transition($new_status, $old_status, $post) {
  // Only first-time publishes: updates to an already-published post must not
  // re-fire (editors saving drafts would spam subscribers).
  if ($new_status !== 'publish' || $old_status === 'publish') return;
  if (!($post instanceof WP_Post)) return;
  // Revisions, autosaves and nav-menu items are not real publishes.
  if (wp_is_post_revision($post) || wp_is_post_autosave($post)) return;
  if ($post->post_type === 'revision' || $post->post_type === 'nav_menu_item') return;

  $enabled = get_option('pushpanel_post_types', array('post'));
  if (!is_array($enabled)) $enabled = array('post');
  if (!in_array($post->post_type, $enabled, true)) return;

  $delay = absint(get_option('pushpanel_delay_seconds', 0));
  $delay = min($delay, 86400);
  if ($delay > 0) {
    wp_schedule_single_event(time() + $delay, PUSHPANEL_CRON_HOOK, array((int) $post->ID, 1));
  } else {
    pushpanel_fire((int) $post->ID, 1);
  }
}

function pushpanel_cron_fire($post_id, $attempt) {
  pushpanel_fire((int) $post_id, (int) $attempt);
}

function pushpanel_fire($post_id, $attempt) {
  $url = get_option('pushpanel_webhook_url');
  $secret = get_option('pushpanel_webhook_secret');
  if (!$url || !$secret) return;
  // Webhook secret must never travel over plaintext http.
  if (strpos($url, 'https://') !== 0) {
    error_log('PushPanel webhook skipped: URL must be https://');
    return;
  }

  $post = get_post($post_id);
  // Post deleted/trashed between scheduling and firing — nothing to announce.
  if (!$post || $post->post_status !== 'publish') return;

  $body = wp_json_encode(array(
    'post_id' => (int) $post_id,
    'post_type' => $post->post_type,
    'title' => get_the_title($post_id),
    'url' => get_permalink($post_id),
  ));
  // Integer ms as a plain string: a float cast can render locale/exponent
  // variants (e.g. "1.7E+12") that break HMAC verification panel-side.
  $ts = (string) (int) round(microtime(true) * 1000);
  // The HMAC covers the timestamp so captured requests cannot be replayed.
  $sig = 'sha256=' . hash_hmac('sha256', $ts . '.' . $body, $secret);

  $response = wp_remote_post($url, array(
    'timeout' => 5,
    'headers' => array(
      'Content-Type' => 'application/json',
      'X-PushPanel-Signature' => $sig,
      'X-PushPanel-Timestamp' => $ts,
    ),
    'body' => $body,
  ));

  if (is_wp_error($response)) {
    error_log('PushPanel webhook failed: ' . $response->get_error_message());
    pushpanel_maybe_retry($post_id, $attempt);
  } elseif ((int) wp_remote_retrieve_response_code($response) !== 200) {
    // Never log the response body — it may echo panel internals.
    error_log('PushPanel webhook rejected: HTTP ' . (int) wp_remote_retrieve_response_code($response));
    // 4xx is a config/auth problem — retrying won't help. Only 5xx (panel
    // temporarily down) deserves a retry.
    $code = (int) wp_remote_retrieve_response_code($response);
    if ($code >= 500 && $code < 600) pushpanel_maybe_retry($post_id, $attempt);
  }
}

function pushpanel_maybe_retry($post_id, $attempt) {
  if ((int) $attempt >= PUSHPANEL_MAX_ATTEMPTS) return;
  // One retry after 5 minutes; WP-Cron dedupes identical scheduled events.
  if (!wp_next_scheduled(PUSHPANEL_CRON_HOOK, array((int) $post_id, (int) $attempt + 1))) {
    wp_schedule_single_event(time() + 300, PUSHPANEL_CRON_HOOK, array((int) $post_id, (int) $attempt + 1));
  }
}
