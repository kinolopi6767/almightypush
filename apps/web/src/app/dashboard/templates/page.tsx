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
   <PageHeader eyebrow="Grow · Templates" title="Templates" description="Saved push payloads. Pick a template in the campaign editor to pre-fill title, message and links." />

   <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
    <div className="space-y-3">
     {rows.length === 0 && (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
       No templates yet — save your first notification on the right.
      </div>
     )}
     {rows.map((row) => (
      <div key={row.id} data-entity="template" data-testid={`row-template-${row.id}`} className=" flex flex-col gap-3 rounded-md border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
       <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.name}</p>
        <p className="mt-0.5 line-clamp-2 break-words text-sm text-muted-foreground">
         <span className="font-medium text-foreground">{row.title}</span>
         {row.message ? ` — ${row.message.slice(0, 80)}` : ""}
        </p>
        {row.launch_url && <p className="mt-1 truncate text-xs text-muted-foreground">{row.launch_url}</p>}
       </div>
       <div className="flex shrink-0 items-center gap-2 sm:ml-4">
        <Link href={`/dashboard/templates/${row.id}`} className="btn btn-secondary btn-sm" aria-label={`Edit template ${row.name}`}>
         Edit
        </Link>
        <form action={deleteTemplateAction.bind(null, row.id)}>
         <SubmitButton
          confirm={`Delete template "${row.name}"?`}
          pendingLabel="Deleting…"
          className="btn btn-danger-ghost btn-sm"
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