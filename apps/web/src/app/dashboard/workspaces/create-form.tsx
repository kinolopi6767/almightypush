"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createWorkspaceAction } from "./actions";

export function CreateWorkspaceForm() {
 const router = useRouter();
 const [state, action, pending] = useActionState(createWorkspaceAction as never, undefined as never);

 // After create, refresh to show new workspace and switched state.
 // Must live in an effect — calling router.refresh() during render is a
 // React update-during-render violation and loops because state.ok persists.
 const ok = (state as { ok?: boolean })?.ok;
 useEffect(() => {
  if (ok) router.refresh();
 }, [ok, router]);

 return (
  <form action={action} className="panel space-y-3 rounded-md p-5">
   <h3 className="text-[15px] font-semibold tracking-tight">Create workspace</h3>
   <p className="text-xs text-muted-foreground">For agencies: each workspace isolates domains, campaigns, subscribers.</p>
   <div className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-1">
     <label htmlFor="ws-name" className="text-sm font-medium">
      Name
     </label>
     <input id="ws-name" name="name" required placeholder="Acme Inc" className="input" />
    </div>
    <div className="space-y-1">
     <label htmlFor="ws-slug" className="text-sm font-medium">
      Slug <span className="font-normal text-muted-foreground">(optional)</span>
     </label>
     <input id="ws-slug" name="slug" placeholder="acme" className="input" />
    </div>
   </div>
   {(state as { error?: string })?.error && <p role="alert" className="text-sm text-destructive">{(state as { error?: string }).error}</p>}
   {(state as { ok?: boolean })?.ok && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">Workspace created and switched.</p>}
   <button type="submit" disabled={pending} className="btn btn-primary">
    {pending ? "Creating…" : "Create workspace"}
   </button>
  </form>
 );
}
