import { db } from "@/lib/db";
import { teamInvites, users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { InviteForm } from "./invite-form";

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
      <div>
        <h1 className="text-2xl font-semibold">Team — Multi-User RBAC</h1>
        <p className="text-sm text-muted-foreground">LumaPush Business: owner/admin/editor/viewer. Invite via email, 7-day expiry.</p>
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="font-medium">Members ({members.length})</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex gap-2">
              <span className="font-mono text-xs">{m.role}</span> {m.name ?? m.email} ({m.email})
            </li>
          ))}
        </ul>
      </div>
      <InviteForm />
      <div className="rounded-lg border p-4">
        <h3 className="font-medium">Pending invites ({invites.length})</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {invites.map((i) => (
            <li key={i.id} className="flex gap-2 text-muted-foreground">
              {i.email} — {i.role} — {i.expires_at?.slice(0, 10)} {i.accepted_at ? "✓ accepted" : "pending"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
