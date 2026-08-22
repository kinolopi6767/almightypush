import { db } from "@/lib/db";
import { domains, lpLinks } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { and, eq, isNull } from "drizzle-orm";
import { LinkForm } from "./link-form";
import { deleteLinkAction, type Link } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "LP links" };

function shortUrl(slug: string): string {
  return `/p/${slug}`;
}

export default async function LinksPage() {
  const session = await auth();
  const workspaceId = Number(session?.user?.workspaceId ?? 0);

  const wsDomains = db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(eq(domains.workspace_id, workspaceId))
    .orderBy(domains.name)
    .all();

  const rows = db
    .select({
      id: lpLinks.id,
      code: lpLinks.code,
      target_url: lpLinks.target_url,
      prompt_text: lpLinks.prompt_text,
      clicks_count: lpLinks.clicks_count,
      subscribers_count: lpLinks.subscribers_count,
      created_at: lpLinks.created_at,
    })
    .from(lpLinks)
    .where(and(eq(lpLinks.workspace_id, workspaceId), isNull(lpLinks.deleted_at)))
    .orderBy(lpLinks.created_at)
    .all() as Omit<Link, "force_subscribe">[];

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">LP links</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Collection links: a landing page that captures push subscribers before sending visitors to your post.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No links yet — create your first landing page on the right.
            </div>
          )}
          {rows.map((row) => (
            <div key={row.id} className="card-lift rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium">{row.target_url}</p>
                  <a href={shortUrl(row.code)} className="mt-0.5 inline-block break-all text-sm text-primary hover:underline">
                    {shortUrl(row.code)}
                  </a>
                  {row.prompt_text && <p className="mt-1 truncate text-xs text-muted-foreground">Prompt: {row.prompt_text}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm tabular-nums text-muted-foreground">
                  <span className="whitespace-nowrap">{row.clicks_count.toLocaleString()} clicks</span>
                  <span className="whitespace-nowrap">{row.subscribers_count.toLocaleString()} subs</span>
                  <form action={deleteLinkAction.bind(null, row.id)}>
                    <SubmitButton confirm={`Delete link ${row.code}?`} pendingLabel="…" className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title={`Delete link ${row.code}`}>Delete</SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
        <LinkForm domains={wsDomains} />
      </div>
    </>
  );
}