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
      <div>
        <h1 className="text-2xl font-semibold">Email Marketing</h1>
        <p className="text-sm text-muted-foreground">LumaPush parity: drag-drop builder, SPF/DKIM/DMARC, CSV import, automation.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Campaigns</p>
          <p className="text-2xl font-bold">{campaigns.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Contacts</p>
          <p className="text-2xl font-bold">{contacts.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Sending domains</p>
          <p className="text-2xl font-bold">{domains.length}</p>
          <p className="text-xs">{domains.map((d) => `${d.domain} (${d.status})`).join(", ") || "none"}</p>
        </div>
      </div>
      <div className="rounded-lg border p-6">
        <h2 className="font-medium">Visual Builder</h2>
        <p className="text-sm text-muted-foreground">Blocks: hero, text, button, divider, social, product. Saved in <code>blocks_json</code> → rendered via <code>renderBlocksToHtml()</code>. Use CSV import at <code>/api/v1/email/import</code> (LumaPush 25k → 500k).</p>
        <pre className="mt-3 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(campaigns.slice(0, 2), null, 2)}</pre>
      </div>
    </div>
  );
}
