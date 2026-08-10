import { db } from "@/lib/db";
import { domains, lpLinks } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { and, eq, isNull } from "drizzle-orm";
import { LinkForm } from "./link-form";
import { deleteLinkAction, type Link } from "./actions";

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
            <div key={row.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">{row.target_url}</p>
                  <a href={shortUrl(row.code)} className="mt-0.5 break-all text-sm text-primary hover:underline">
                    {shortUrl(row.code)}
                  </a>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
                  <span>{row.clicks_count} clicks</span>
                  <span>{row.subscribers_count} subs</span>
                  <form action={deleteLinkAction.bind(null, row.id)}>
                    <button type="submit" className="text-muted-foreground hover:text-destructive">
                      Delete
                    </button>
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