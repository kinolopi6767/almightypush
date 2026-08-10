import Link from "next/link";
import { db } from "@/lib/db";
import { templates } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { eq, desc } from "drizzle-orm";
import { TemplateForm } from "./template-form";
import { deleteTemplateAction } from "./actions";

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
      <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Saved push payloads. Pick a template in the campaign editor to pre-fill title, message and links.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No templates yet — save your first notification on the right.
            </div>
          )}
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {row.title}
                    {row.message ? ` — ${row.message.slice(0, 60)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/dashboard/templates/${row.id}`} className="text-sm text-primary hover:underline">
                    Edit
                  </Link>
                  <form action={deleteTemplateAction.bind(null, row.id)}>
                    <button type="submit" className="text-sm text-muted-foreground hover:text-destructive">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
        <TemplateForm />
      </div>
    </>
  );
}