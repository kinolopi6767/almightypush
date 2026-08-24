import Link from "next/link";
import { db } from "@/lib/db";
import { templates } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { eq, desc } from "drizzle-orm";
import { TemplateForm } from "./template-form";
import { deleteTemplateAction } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const session = await auth();
  const workspaceId = Number(session?.user?.workspaceId ?? 0);

  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      title: templates.title,
      message: templates.message,
      launch_url: templates.launch_url,
      created_at: templates.created_at,
    })
    .from(templates)
    .where(eq(templates.workspace_id, workspaceId))
    .orderBy(desc(templates.created_at))
    .all();

  return (
    <>
      <PageHeader title="Templates" description="Saved push payloads. Pick a template in the campaign editor to pre-fill title, message and links." />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No templates yet — save your first notification on the right.
            </div>
          )}
          {rows.map((row) => (
            <div key={row.id} className="card-lift flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.name}</p>
                <p className="mt-0.5 line-clamp-2 break-words text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{row.title}</span>
                  {row.message ? ` — ${row.message.slice(0, 80)}` : ""}
                </p>
                {row.launch_url && <p className="mt-1 truncate text-xs text-muted-foreground">{row.launch_url}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:ml-4">
                <Link href={`/dashboard/templates/${row.id}`} className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent" aria-label={`Edit template ${row.name}`}>
                  Edit
                </Link>
                <form action={deleteTemplateAction.bind(null, row.id)}>
                  <SubmitButton
                    confirm={`Delete template "${row.name}"?`}
                    pendingLabel="Deleting…"
                    className="inline-flex h-8 items-center rounded-md border border-destructive/30 bg-background px-3 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    Delete
                  </SubmitButton>
                </form>
              </div>
            </div>
          ))}
        </div>
        <TemplateForm />
      </div>
    </>
  );
}