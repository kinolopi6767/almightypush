import { db } from "@/lib/db";
import { emailCampaigns, emailContacts, emailSendingDomains } from "@pushpanel/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
 const session = await auth();
 if (!session?.user) redirect("/login");
 const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : 0;

 // Counts come from covering-index aggregates — loading full rows (incl.
 // html/blocks_json blobs) just to read `.length` would OOM at scale.
 const campaignCount = wsId ? db.select({ value: count() }).from(emailCampaigns).where(eq(emailCampaigns.workspace_id, wsId)).get()?.value ?? 0 : 0;
 const contactCount = wsId ? db.select({ value: count() }).from(emailContacts).where(eq(emailContacts.workspace_id, wsId)).get()?.value ?? 0 : 0;
 // Sending domains are tiny — full rows for the status line.
 const domains = wsId ? db.select().from(emailSendingDomains).where(eq(emailSendingDomains.workspace_id, wsId)).all() : [];
 // Preview: latest two campaigns, slim columns (no html/blobs).
 const recent = wsId
  ? db
    .select({ id: emailCampaigns.id, subject: emailCampaigns.subject, status: emailCampaigns.status, schedule_at: emailCampaigns.schedule_at, sent_at: emailCampaigns.sent_at })
    .from(emailCampaigns)
    .where(eq(emailCampaigns.workspace_id, wsId))
    .orderBy(desc(emailCampaigns.id))
    .limit(2)
    .all()
  : [];

 return (
  <div className="space-y-6">
   <PageHeader eyebrow="Grow · Email"
    title="Email Marketing"
    description="Drag-drop builder, SPF/DKIM/DMARC, CSV import, automation — personal unlimited."
   >
    <div className="flex items-center gap-2 pt-1 sm:hidden">
     <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{campaignCount} campaigns</span>
     <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{contactCount} contacts</span>
    </div>
   </PageHeader>
   <div className="mt-6 hidden sm:flex items-center gap-2">
    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{campaignCount} campaigns</span>
    <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{contactCount} contacts</span>
   </div>
   <div className="grid gap-4 md:grid-cols-3">
    <div className="panel p-4">
     <p className="micro-label">Campaigns</p>
     <p className="tabular mt-3 text-[30px] font-semibold leading-none tracking-tight">{campaignCount}</p>
     <p className="mt-1 text-xs text-muted-foreground">Scheduled / sending / done</p>
    </div>
    <div className="panel p-4">
     <p className="micro-label">Contacts</p>
     <p className="tabular mt-3 text-[30px] font-semibold leading-none tracking-tight">{contactCount}</p>
     <p className="mt-1 text-xs text-muted-foreground">All imported + verified</p>
    </div>
    <div className="panel p-4">
     <p className="micro-label">Sending domains</p>
     <p className="tabular mt-3 text-[30px] font-semibold leading-none tracking-tight">{domains.length}</p>
     <p className="mt-1 truncate text-xs text-muted-foreground" title={domains.map((d) => `${d.domain} (${d.status})`).join(", ") || "none — add one to send"}>
      {domains.map((d) => `${d.domain} (${d.status})`).join(", ") || "none — add one to send"}
     </p>
    </div>
   </div>
   <div className="panel p-4">
    <h2 className="text-[15px] font-semibold tracking-tight">Visual Builder</h2>
    <p className="mt-1 text-sm text-muted-foreground">Blocks: hero, text, button, divider, social, product. Saved in <code className="rounded bg-muted px-1 font-mono text-xs">blocks_json</code> → rendered via <code className="rounded bg-muted px-1 font-mono text-xs">renderBlocksToHtml()</code>. Import CSV at <code className="rounded bg-muted px-1 font-mono text-xs">/dashboard/email</code> → contacts. All unlimited for personal use.</p>
    {recent.length === 0 ? (
     <p className="mt-4 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No email campaigns yet — create one from the panel or via API.</p>
    ) : (
     <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">{JSON.stringify(recent, null, 2)}</pre>
    )}
   </div>
  </div>
 );
}
