import Link from "next/link";
import { db } from "@/lib/db";
import { domains, segments } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import { SegmentForm } from "./segment-form";
import { deleteSegmentAction } from "./actions";

export const metadata = { title: "Segments" };

export default async function SegmentsPage() {
  const session = await auth();
  const workspaceId = Number(session?.user?.workspaceId ?? 0);

  const rows = await db
    .select({
      id: segments.id,
      name: segments.name,
      domain_ids_json: segments.domain_ids_json,
      estimate_count: segments.estimate_count,
      estimate_at: segments.estimate_at,
      created_at: segments.created_at,
    })
    .from(segments)
    .where(eq(segments.workspace_id, workspaceId))
    .orderBy(segments.created_at)
    .all();

  const wsDomains = await db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(eq(domains.workspace_id, workspaceId))
    .orderBy(domains.name)
    .all();

  const namesById = new Map(wsDomains.map((d) => [d.id, d.name]));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Reusable audience rules built on subscriber attributes. Pick a segment as a campaign audience and it stays
        up to date.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No segments yet — build your first audience rule on the right.
            </div>
          )}
          {rows.map((row) => {
            let domainsLabel = "All domains";
            try {
              const ids = row.domain_ids_json ? (JSON.parse(row.domain_ids_json) as number[]) : [];
              if (ids.length > 0) domainsLabel = ids.map((id) => namesById.get(id) ?? `#${id}`).join(", ");
            } catch {
              domainsLabel = "All domains";
            }
            return (
              <div key={row.id} className="card-lift rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{domainsLabel}</p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-primary">
                    ~{row.estimate_count?.toLocaleString() ?? "…"} subs
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <Link href={`/dashboard/segments/${row.id}`} className="inline-flex h-7 items-center rounded-md border px-2.5 text-xs hover:bg-accent" aria-label={`Edit segment ${row.name}`}>
                    Edit
                  </Link>
                  <form action={deleteSegmentAction.bind(null, row.id)}>
                    <button type="submit" aria-label={`Delete segment ${row.name}`} className="inline-flex h-7 items-center rounded-md border border-destructive/20 px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      Delete
                    </button>
                  </form>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {row.estimate_at ? `estimated ${new Date(row.estimate_at).toLocaleString()}` : "not estimated yet"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <SegmentForm domains={wsDomains} />
      </div>
    </>
  );
}
