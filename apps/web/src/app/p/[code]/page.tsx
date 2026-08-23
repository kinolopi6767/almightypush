import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { domains, lpLinks } from "@pushpanel/db/schema";
import { LandingClient } from "./landing-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notifications" };

export default async function LandingPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ dev?: string }> }) {
  const { code } = await params;
  const [link] = await db
    .select({
      id: lpLinks.id,
      domain_id: lpLinks.domain_id,
      target_url: lpLinks.target_url,
      prompt_text: lpLinks.prompt_text,
      force_subscribe: lpLinks.force_subscribe,
      deleted_at: lpLinks.deleted_at,
    })
    .from(lpLinks)
    .where(eq(lpLinks.code, code))
    .limit(1)
    .all();
  if (!link) notFound();

  // Count the visit — before any redirect. db.run is synchronous; no await needed.
  // Crawlers/link-expanders (Slack/WhatsApp previews, prefetchers) must not
  // inflate conversion metrics — skip counting for obvious bot UAs.
  const ua = (await headers()).get("user-agent") ?? "";
  // Named crawlers + link-preview agents only — deliberately NOT matching
  // generic "headless": legitimate automation (e2e suites) must still count,
  // and custom-UA bots bypass any denylist anyway (industry-standard caveat).
  if (!/bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|discordapp|embedly|quora/i.test(ua)) {
    db.update(lpLinks)
      .set({ clicks_count: sql`${lpLinks.clicks_count} + 1` })
      .where(eq(lpLinks.id, link.id))
      .run();
  }

  if (link.deleted_at) {
    redirect(link.target_url);
  }

  const host = (await headers()).get("host") ?? "localhost:3100";
  const proto = process.env.NODE_ENV === "production" && !host.startsWith("127.0.0.1") ? "https" : "http";
  const baseUrl = `${proto}://${host}`;

  let publicKey = "";
  if (link.domain_id) {
    const [domain] = db
      .select({ provider_config_json: domains.provider_config_json, status: domains.status })
      .from(domains)
      .where(eq(domains.id, link.domain_id))
      .limit(1)
      .all();
    if (domain?.status === "active" && domain.provider_config_json) {
      try {
        const cfg = JSON.parse(domain.provider_config_json) as { publicKey?: string };
        publicKey = cfg.publicKey ?? "";
      } catch {
        publicKey = "";
      }
    }
  }

  // `dev=1` simulates a subscription for headless e2e runs — it must never
  // work for anonymous visitors, or anyone could inflate subscriber counts.
  const wantsDev = (await searchParams).dev === "1";
  const session = await auth();
  const devMode = wantsDev && Boolean(session?.user);

  return (
    <>
      {/* Same-origin SDK load — passes CSP script-src 'self'. */}
      <script src="/sdk/pushpanel-sdk.js" />
      <style>{`body{margin:0;background:#0f172a}`}</style>
      <LandingClient
        code={code}
        baseUrl={baseUrl}
        targetUrl={link.target_url}
        prompt={link.prompt_text || "Get notified when we publish something new"}
        forceSubscribe={Boolean(link.force_subscribe)}
        domainId={publicKey ? link.domain_id : null}
        publicKey={publicKey}
        devMode={devMode}
      />
    </>
  );
}