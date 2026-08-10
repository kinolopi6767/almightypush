import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { lpLinks } from "@pushpanel/db/schema";
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

  // Count the visit — before any redirect.
  await db.update(lpLinks).set({ clicks_count: sql`${lpLinks.clicks_count} + 1` }).where(eq(lpLinks.id, link.id)).run();

  if (link.deleted_at) {
    redirect(link.target_url);
  }

  const host = (await headers()).get("host") ?? "localhost:3100";
  const proto = process.env.NODE_ENV === "production" && !host.startsWith("127.0.0.1") ? "https" : "http";
  const baseUrl = `${proto}://${host}`;

  let publicKey = "";
  if (link.domain_id) {
    const res = await fetch(`${baseUrl}/api/v1/info?domain=${link.domain_id}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { publicKey?: string };
      publicKey = data.publicKey ?? "";
    }
  }

  // `dev=1` simulates a subscription for headless e2e runs — it must never
  // work for anonymous visitors, or anyone could inflate subscriber counts.
  const wantsDev = (await searchParams).dev === "1";
  const session = await auth();
  const devMode = wantsDev && Boolean(session?.user);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <script src="/sdk/pushpanel-sdk.js" />
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
      </body>
    </html>
  );
}