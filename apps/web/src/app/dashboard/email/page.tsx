import { db } from "@/lib/db";
import { emailCampaigns, emailContacts, emailSendingDomains } from "@pushpanel/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : 0;

  const campaigns = wsId ? db.select().from(emailCampaigns).where(eq(emailCampaigns.workspace_id, wsId)).orderBy(desc(emailCampaigns.id)).all() : [];
  const domains = wsId ? db.select().from(emailSendingDomains).where(eq(emailSendingDomains.workspace_id, wsId)).all() : [];
  const contacts = wsId ? db.select().from(emailContacts).where(eq(emailContacts.workspace_id, wsId)).all() : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Email Marketing</h1>
          <p className="mt-1 text-sm text-muted-foreground">Drag-drop builder, SPF/DKIM/DMARC, CSV import, automation — personal unlimited.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{campaigns.length} campaigns</span>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{contacts.length} contacts</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
          <p className="kicker text-muted-foreground">Campaigns</p>
          <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{campaigns.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Scheduled / sending / done</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
          <p className="kicker text-muted-foreground">Contacts</p>
          <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{contacts.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">All imported + verified</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
          <p className="kicker text-muted-foreground">Sending domains</p>
          <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{domains.length}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={domains.map((d) => `${d.domain} (${d.status})`).join(", ") || "none — add one to send"}>
            {domains.map((d) => `${d.domain} (${d.status})`).join(", ") || "none — add one to send"}
          </p>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Visual Builder</h2>
        <p className="mt-1 text-sm text-muted-foreground">Blocks: hero, text, button, divider, social, product. Saved in <code className="rounded bg-muted px-1 font-mono text-xs">blocks_json</code> → rendered via <code className="rounded bg-muted px-1 font-mono text-xs">renderBlocksToHtml()</code>. Import CSV at <code className="rounded bg-muted px-1 font-mono text-xs">/dashboard/email</code> → contacts. All unlimited for personal use.</p>
        {campaigns.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No email campaigns yet — create one from the panel or via API.</p>
        ) : (
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">{JSON.stringify(campaigns.slice(0, 2), null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
