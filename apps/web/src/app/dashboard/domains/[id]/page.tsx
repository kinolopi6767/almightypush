import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliveries, domains, events, subscribers } from "@pushpanel/db/schema";
import { TestPushForm } from "../test-push-form";

export const metadata = { title: "Domain" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DomainDetailPage({ params }: Props) {
  const { id } = await params;
  const domainId = Number(id);
  if (!Number.isInteger(domainId)) notFound();

  const [domain] = db.select().from(domains).where(eq(domains.id, domainId)).limit(1).all();
  if (!domain) notFound();

  const [subsRow] = db
    .select({ value: count() })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .all();
  const activeSubs = subsRow?.value ?? 0;

  const recentDeliveries = await db
    .select({
      id: deliveries.id,
      status: deliveries.status,
      error: deliveries.error,
      sent_at: deliveries.sent_at,
    })
    .from(deliveries)
    .where(eq(deliveries.domain_id, domainId))
    .orderBy(desc(deliveries.id))
    .limit(5)
    .all();

  const [clicksRow] = await db
    .select({ value: count() })
    .from(events)
    .where(and(eq(events.domain_id, domainId), eq(events.type, "clicked")))
    .all();

  let config: { publicKey?: string; subject?: string } = {};
  try {
    config = domain.provider_config_json ? JSON.parse(domain.provider_config_json) : {};
  } catch {
    config = {};
  }

  const snippet = `<script src="https://YOUR-PANEL-HOST/sdk/pushpanel-sdk.js"></script>
<script>
  PushPanel.init({
    domain: ${domain.id},
    publicKey: "${config.publicKey ?? ""}",
    baseUrl: "https://YOUR-PANEL-HOST",
    serviceWorkerPath: "/sw.js"
  });
</script>`;

  return (
    <>
      <div className="flex items-center gap-3">
        <Link href="/dashboard/domains" className="text-sm text-muted-foreground hover:text-foreground">
          ← Domains
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{domain.name}</h1>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {domain.status}
        </span>
        <Link
          href={`/dashboard/domains/${domainId}/subscribers`}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Subscribers
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Active subscribers", activeSubs],
          ["Clicks", clicksRow?.value ?? 0],
          ["Recent deliveries", recentDeliveries.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">VAPID public key</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The public half of this domain&apos;s keypair — embed it in your site. The private half is stored
              encrypted at rest.
            </p>
            <code className="mt-3 block break-all rounded-md bg-background p-3 text-xs">{config.publicKey}</code>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Integration snippet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste into your site&apos;s HTML. The SDK asks for permission, registers the service worker and reports
              the subscription back to this panel.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 text-xs">{snippet}</pre>
            <p className="mt-3 text-xs text-muted-foreground">
              Sandbox demo:{" "}
              <Link href={`/demo?domain=${domain.id}`} className="underline">
                /demo?domain={domain.id}
              </Link>
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Recent deliveries</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {recentDeliveries.length === 0 && (
                <li className="text-muted-foreground">Nothing sent yet — try the test push form.</li>
              )}
              {recentDeliveries.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">delivery #{d.id}</span>
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs">{d.status}</span>
                  {d.error && <span className="truncate text-xs text-destructive">{d.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <TestPushForm domainId={domain.id} />
      </div>
    </>
  );
}
