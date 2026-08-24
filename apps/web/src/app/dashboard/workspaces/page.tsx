import { auth } from "@/auth";
import { db } from "@/lib/db";
import { workspaces, users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CreateWorkspaceForm } from "./create-form";
import { WorkspaceSwitchItem } from "./switch-item";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const currentUserId = Number(session.user.id);
  const currentWorkspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;

  // For now, show all workspaces (single-tenant personal use: you own them all)
  // Future: filter via workspace_members
  const allWorkspaces = db.select().from(workspaces).orderBy(workspaces.created_at).all();
  const currentUser = db.select({ workspace_id: users.workspace_id }).from(users).where(eq(users.id, currentUserId)).get();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage client profiles — each workspace has isolated domains, campaigns, and subscribers. Perfect for agencies.</p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-medium">Active workspace</h2>
        <div className="mt-3">
          <WorkspaceSwitcher workspaces={allWorkspaces} currentId={currentWorkspaceId} currentUserWorkspaceId={currentUser?.workspace_id ?? null} />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-medium">All workspaces ({allWorkspaces.length})</h2>
        <ul className="mt-3 space-y-2">
          {allWorkspaces.map((ws) => (
            <li key={ws.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">{ws.name}</p>
                <p className="text-xs text-muted-foreground">/{ws.slug ?? "no-slug"} · #{ws.id} {ws.id === currentWorkspaceId && <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">active</span>}</p>
              </div>
              {ws.id === currentWorkspaceId ? (
                <span className="text-xs font-medium text-primary">Active</span>
              ) : (
                <WorkspaceSwitchItem workspaceId={ws.id} />
              )}
            </li>
          ))}
        </ul>
      </div>

      <CreateWorkspaceForm />

      <p className="text-xs text-muted-foreground">
        Each workspace is isolated: domains, campaigns, subscribers, and API keys are scoped. Switch via the sidebar or here. Data stays on your server.
      </p>
    </div>
  );
}
