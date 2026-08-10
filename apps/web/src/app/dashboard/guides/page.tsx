import type { ReactNode } from "react";
import { CodeBlock } from "@/components/code-block";

export const metadata = { title: "Guides" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

export default function GuidesPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Guides</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Wire PushPanel into WordPress, Blogger and AMP pages — no plugin install required.
      </p>

      <div className="mt-8 max-w-3xl space-y-10">
        <Section title="WordPress (push-on-publish webhook)">
          <P>
            Use the <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">push_on_publish</code>{" "}
            automation&apos;s webhook URL as a WordPress plugin trigger. Paste this snippet into a site plugin or{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">functions.php</code> to fire on every
            published post:
          </P>
          <CodeBlock
            label="functions.php"
            code={`<?php
// PushPanel — fire push-on-publish from WordPress
add_action('publish_post', function ($post_id, $post) {
  $secret = getenv('PUSHPANEL_WEBHOOK_SECRET'); // the automation's secret
  $url    = getenv('PUSHPANEL_WEBHOOK_URL');    // shown on the automation card
  if (!$secret || !$url) return;

  $body = json_encode(['post_id' => $post_id]);
  $ts   = (string) (microtime(true) * 1000);
  $sig  = 'sha256=' . hash_hmac('sha256', $body, $secret);

  wp_remote_post($url, [
    'headers' => [
      'X-PushPanel-Signature' => $sig,
      'X-PushPanel-Timestamp' => $ts,
      'Content-Type'          => 'application/json',
    ],
    'body' => $body,
  ]);
}, 10, 2);`}
          />
        </Section>

        <Section title="Blogger (AutoMagic dynamic feed)">
          <P>
            Blogger exposes its posts as an Atom feed at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">https://BLOG.blogspot.com/feeds/posts/default</code>.
            Create an{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">automagic_dynamic</code> automation and set
            that feed URL as the source with a 15-minute interval — the worker polls, picks a random new post and sends
            a push.
          </P>
          <CodeBlock
            label="Feed URL (Blogger)"
            code={`https://your-blog.blogspot.com/feeds/posts/default`}
          />
        </Section>

        <Section title="AMP pages (client SDK)">
          <P>
            AMP pages can&apos;t run arbitrary scripts, so load the SDK on the canonical page and let AMP readers land
            there. Plain HTML sites include the SDK bundle and initialise it with the domain&apos;s VAPID key:
          </P>
          <CodeBlock
            label="HTML"
            code={`<script src="https://your-panel.example.com/sdk/pushpanel-sdk.js"></script>
<script>
  window.PushPanel = window.PushPanel || {};
  // Fetch the VAPID key from the panel, then:
  const api = PushPanel.init({
    domain: 12,                       // your domain id
    publicKey: "BASE64URL_VAPID_KEY", // GET /api/v1/info?domain=12
    baseUrl: "https://your-panel.example.com",
  });
  document.getElementById("allow").addEventListener("click", () => api.subscribe());
</script>`}
          />
        </Section>
      </div>
    </>
  );
}