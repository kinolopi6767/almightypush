import { db } from "@/lib/db";
import { teamInvites, users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { InviteForm } from "./invite-form";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : 0;
  const invites = wsId ? db.select().from(teamInvites).where(eq(teamInvites.workspace_id, wsId)).all() : [];
  const members = wsId ? db.select({ id: users.id, email: users.email, name: users.name, role: users.role }).from(users).where(eq(users.workspace_id, wsId)).all() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Multi-user RBAC — owner / admin / editor / viewer · invites expire in 7 days · personal unlimited."
      />
      <div className="surface rounded-xl p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Members ({members.length})</h2>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No members yet — just you. Invite teammates below.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name ?? m.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                <span className="ml-3 shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <InviteForm />
      <div className="surface rounded-xl p-5">
        <h3 className="text-[15px] font-semibold tracking-tight">Pending invites ({invites.length})</h3>
        {invites.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.email}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{i.role}</span>
                <span className="text-xs text-muted-foreground">{i.expires_at?.slice(0, 10)} {i.accepted_at ? "✓ accepted" : "· pending"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
