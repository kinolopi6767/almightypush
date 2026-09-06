import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { templates } from "@pushpanel/db/schema";
import { TemplateForm } from "../template-form";
import type { TemplatePayload } from "../payload";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Edit template" };

export default async function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
 const session = await auth();
 const workspaceId = Number(session?.user?.workspaceId ?? 0);
 const id = Number((await params).id);
 if (!Number.isInteger(id)) notFound();

 const [row] = await db
  .select({
   id: templates.id,
   name: templates.name,
   title: templates.title,
   message: templates.message,
   icon_url: templates.icon_url,
   image_url: templates.image_url,
   launch_url: templates.launch_url,
   buttons_json: templates.buttons_json,
  })
  .from(templates)
  .where(and(eq(templates.id, id), eq(templates.workspace_id, workspaceId)))
  .limit(1)
  .all();
 if (!row) notFound();

 const initial: TemplatePayload = { ...row };

 return (
  <>
   <Link href="/dashboard/templates" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
    ← Back to templates
   </Link>
   <div className="mt-2">
    <PageHeader eyebrow="Grow · Templates" title="Edit template" />
   </div>
   <div className="mt-8 max-w-2xl">
    <TemplateForm initial={initial} />
   </div>
  </>
 );
}