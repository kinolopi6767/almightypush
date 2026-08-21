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
            Install the plugin to fire the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">push_on_publish</code> webhook on every
            published post — no API keys, just the automation&apos;s secret:
          </P>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/v1/plugin/wordpress"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Download WordPress plugin
            </a>
            <span className="text-sm text-muted-foreground">(upload to /wp-content/plugins/, activate, paste webhook URL + secret)</span>
          </div>
          <P>Or trigger the webhook yourself with a snippet in a site plugin or functions.php:</P>
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

        <Section title="Shopify (LumaPush parity)">
          <P>
            Add the SDK to your Shopify theme&apos;s <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">layout/theme.liquid</code> before{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{"</head>"}</code> and trigger on the
            order-thank-you page. Works with cart-recovery Journeys:
          </P>
          <CodeBlock
            label="Shopify theme.liquid"
            code={`<!-- PushPanel Shopify -->
<script src="https://your-panel.example.com/sdk/pushpanel-sdk.js"></script>
<script>
  const api = PushPanel.init({ domain: 7, publicKey: "VAPID_KEY", baseUrl: "https://your-panel.example.com", prompt: { type: "auto", position: "bottom-right" }});
  // Shopify cart recovery: on /cart, tag subscriber via API
  fetch('/api/v1/track', {method:'POST', body: JSON.stringify({event:'cart_view', tags:['cart']})});
</script>`}
          />
        </Section>

        <Section title="Ghost CMS (RSS AutoMagic)">
          <P>
            Ghost exposes <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/rss/</code>. Create an{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">automagic_dynamic</code> automation with
            source <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">https://your-ghost.com/rss/</code> and
            interval 15m — identical to Blogger, plus native email via Ghost members import.
          </P>
          <CodeBlock label="Ghost RSS" code={`https://your-ghost.com/rss/`} />
        </Section>

        <Section title="Zapier & Make.com (Webhooks)">
          <P>
            Every campaign/automation trigger is a webhook: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">POST /api/v1/send</code>{" "}
            (X-Api-Key) or <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">POST /api/v1/automations/{"{id}"}/trigger</code>{" "}
            (HMAC). Connect 1k+ apps via Zapier/Make by forwarding their hook to these endpoints.
          </P>
          <CodeBlock
            label="Zapier webhook"
            code={`curl -X POST https://your-panel.example.com/api/v1/send \\
  -H "X-Api-Key: ppk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"domain":"example.com","title":"New post","url":"https://example.com/new","audience":{"kind":"segment","segment_id":3}}'`}
          />
        </Section>

        <Section title="Email — Shopify/Ghost to PushPanel">
          <P>
            Import existing lists via CSV at <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/dashboard/email</code> →{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">email_contacts</code> (1→unlimited tags, SPF/DKIM/DMARC at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/dashboard/email</code> sending domains). Drip via Journeys.
          </P>
        </Section>
      </div>
    </>
  );
}