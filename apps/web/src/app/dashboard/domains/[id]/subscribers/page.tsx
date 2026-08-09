import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { domains, subscribers } from "@pushpanel/db/schema";
import { and, count, desc, eq, isNotNull, isNull, like, or } from "drizzle-orm";
import { SubscribersTools } from "./subscribers-tools";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata = { title: "Subscribers" };

const PAGE_SIZE = 25;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}

export default async function SubscribersPage({ params, searchParams }: Props) {
  const { id } = await params;
  const domainId = Number(id);
  if (!Number.isInteger(domainId)) notFound();

  const session = await auth();
  if (!session?.user) notFound();
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;

  const [domain] = db
    .select({
      id: domains.id,
      name: domains.name,
      workspace_id: domains.workspace_id,
      subscribers_count: domains.subscribers_count,
    })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1)
    .all();
  if (!domain || (workspaceId && domain.workspace_id !== workspaceId)) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1));

  const where = and(
    eq(subscribers.domain_id, domainId),
    status === "active" ? isNull(subscribers.unsubscribed_at) : undefined,
    status === "unsubscribed" ? isNotNull(subscribers.unsubscribed_at) : undefined,
    q
      ? or(
          like(subscribers.browser, `%${q}%`),
          like(subscribers.os, `%${q}%`),
          like(subscribers.device, `%${q}%`),
          like(subscribers.country, `%${q}%`),
          like(subscribers.state, `%${q}%`),
        )
      : undefined,
  );

  const [totalRow, activeRow, unsubRow, list] = await Promise.all([
    db.select({ value: count() }).from(subscribers).where(eq(subscribers.domain_id, domainId)).get(),
    db
      .select({ value: count() })
      .from(subscribers)
      .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
      .get(),
    db
      .select({ value: count() })
      .from(subscribers)
      .where(and(eq(subscribers.domain_id, domainId), isNotNull(subscribers.unsubscribed_at)))
      .get(),
    db
      .select({
        id: subscribers.id,
        browser: subscribers.browser,
        os: subscribers.os,
        device: subscribers.device,
        country: subscribers.country,
        state: subscribers.state,
        subscribe_url: subscribers.subscribe_url,
        subscribe_at: subscribers.subscribe_at,
        last_active_at: subscribers.last_active_at,
        unsubscribed_at: subscribers.unsubscribed_at,
        unsub_reason: subscribers.unsub_reason,
      })
      .from(subscribers)
      .where(where)
      .orderBy(desc(subscribers.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
      .all(),
  ]);

  const total = totalRow?.value ?? 0;
  const active = activeRow?.value ?? 0;
  const unsubscribed = unsubRow?.value ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const subsPath = `/dashboard/domains/${domainId}/subscribers`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/dashboard/domains/${domainId}`} className="text-sm text-muted-foreground hover:underline">
            ← {domain.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Subscribers</h1>
          <p className="text-sm text-muted-foreground">
            {active} active · {unsubscribed} unsubscribed · {total} total
          </p>
        </div>
      </div>

      <SubscribersTools domainId={domainId} />

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search browser, OS, device, country…"
          className="h-9 w-64 rounded-md border bg-transparent px-3 text-sm"
        />
        <select name="status" aria-label="Status" defaultValue={status} className="h-9 rounded-md border bg-transparent px-2 text-sm">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
        <button type="submit" className="inline-flex h-9 items-center rounded-md bg-secondary px-4 text-sm font-medium hover:bg-secondary/80">
          Filter
        </button>
      </form>

      <div className="rounded-lg border">
        {list.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No subscribers yet — add the SDK snippet to your site or import a list.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Subscribe URL</th>
                <th className="px-4 py-2 font-medium">Subscribed</th>
                <th className="px-4 py-2 font-medium">Last active</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const client = [s.browser, s.os, s.device].filter(Boolean).join(" · ") || "—";
                const location = [s.country, s.state].filter(Boolean).join(", ") || "—";
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <Link href={subsPath} title={client} className="line-clamp-1 max-w-[220px] text-primary hover:underline">
                        {client}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{location}</td>
                    <td className="max-w-[220px] truncate px-4 py-2 text-muted-foreground" title={s.subscribe_url ?? ""}>
                      {s.subscribe_url ? new URL(s.subscribe_url).hostname : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{new Date(s.subscribe_at ?? Date.now()).toLocaleString()}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {s.last_active_at ? new Date(s.last_active_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {s.unsubscribed_at ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          unsubscribed{s.unsub_reason ? ` · ${s.unsub_reason}` : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                          active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!s.unsubscribed_at && <UnsubscribeButton domainId={domainId} subscriberId={s.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={qs({ page: String(page - 1) })}
                className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
              >
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link
                href={qs({ page: String(page + 1) })}
                className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
