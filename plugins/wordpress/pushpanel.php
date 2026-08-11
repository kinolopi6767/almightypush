<?php
/**
 * Plugin Name: PushPanel — push on publish
 * Description: Fires a PushPanel push_on_publish automation webhook whenever a post is published.
 * Version: 0.1.0
 * Author: PushPanel
 * License: GPL-2.0-or-later
 *
 * Setup: Settings → PushPanel → paste the automation webhook URL and secret
 * (shown on the automation card in the PushPanel dashboard).
 */

if (!defined('ABSPATH')) exit;

add_action('admin_menu', 'pushpanel_admin_menu');
add_action('admin_init', 'pushpanel_register_settings');
add_action('publish_post', 'pushpanel_on_publish', 10, 2);

function pushpanel_register_settings() {
  register_setting('pushpanel_settings', 'pushpanel_webhook_url');
  register_setting('pushpanel_settings', 'pushpanel_webhook_secret');
}

function pushpanel_admin_menu() {
  add_options_page('PushPanel', 'PushPanel', 'manage_options', 'pushpanel', 'pushpanel_settings_page');
}

function pushpanel_settings_page() {
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
            value="<?php echo esc_attr(get_option('pushpanel_webhook_secret')); ?>"></td>
        </tr>
      </table>
      <?php submit_button(); ?>
    </form>
  </div>
  <?php
}

function pushpanel_on_publish($post_id, $post) {
  $url = get_option('pushpanel_webhook_url');
  $secret = get_option('pushpanel_webhook_secret');
  if (!$url || !$secret) return;

  $body = wp_json_encode(array('post_id' => (int) $post_id, 'title' => get_the_title($post_id)));
  $ts = (string) (microtime(true) * 1000);
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
  } elseif ((int) wp_remote_retrieve_response_code($response) !== 200) {
    error_log('PushPanel webhook rejected: ' . wp_remote_retrieve_body($response));
  }
}