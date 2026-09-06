import { auth } from "@/auth";
import { db } from "@/lib/db";
import { workspaces, users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CreateWorkspaceForm } from "./create-form";
import { WorkspaceSwitchItem } from "./switch-item";
import { PageHeader } from "@/components/page-header";

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
   <PageHeader eyebrow="System · Workspaces"
    title="Workspaces"
    description="Manage client profiles — each workspace has isolated domains, campaigns, and subscribers. Perfect for agencies."
   />

   <div className="panel p-4">
    <h2 className="font-medium">Active workspace</h2>
    <div className="mt-3">
     <WorkspaceSwitcher workspaces={allWorkspaces} currentId={currentWorkspaceId} currentUserWorkspaceId={currentUser?.workspace_id ?? null} />
    </div>
   </div>

   <div className="panel p-4">
    <h2 className="text-[15px] font-semibold tracking-tight">All workspaces ({allWorkspaces.length})</h2>
    {allWorkspaces.length === 0 ? (
     <p className="mt-3 text-sm text-muted-foreground">No workspaces yet — create one below.</p>
    ) : (
     <ul className="mt-3 space-y-2">
      {allWorkspaces.map((ws) => (
       <li key={ws.id} className="flex items-center justify-between rounded-md border px-3 py-2">
        <div>
         <p className="text-sm font-medium">{ws.name}</p>
         <p className="text-xs text-muted-foreground">/{ws.slug ?? "no-slug"} · #{ws.id} {ws.id === currentWorkspaceId && <span className="btn btn-primary">active</span>}</p>
        </div>
        {ws.id === currentWorkspaceId ? (
         <span className="text-xs font-medium text-primary">Active</span>
        ) : (
         <WorkspaceSwitchItem workspaceId={ws.id} />
        )}
       </li>
      ))}
     </ul>
    )}
   </div>

   <CreateWorkspaceForm />

   <p className="text-xs text-muted-foreground">
    Each workspace is isolated: domains, campaigns, subscribers, and API keys are scoped. Switch via the sidebar or here. Data stays on your server.
   </p>
  </div>
 );
}
