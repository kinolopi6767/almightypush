"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createWorkspaceAction } from "./actions";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createWorkspaceAction as never, undefined as never);

  // After create, refresh to show new workspace and switched state
  if ((state as { ok?: boolean })?.ok) {
    router.refresh();
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border bg-card p-5">
      <h3 className="font-medium">Create workspace</h3>
      <p className="text-xs text-muted-foreground">For agencies: each workspace isolates domains, campaigns, subscribers.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="ws-name" className="text-sm font-medium">
            Name
          </label>
          <input id="ws-name" name="name" required placeholder="Acme Inc" className="h-9 w-full rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1">
          <label htmlFor="ws-slug" className="text-sm font-medium">
            Slug <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input id="ws-slug" name="slug" placeholder="acme" className="h-9 w-full rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      {(state as { error?: string })?.error && <p className="text-sm text-destructive">{(state as { error?: string }).error}</p>}
      {(state as { ok?: boolean })?.ok && <p className="text-sm text-emerald-600">Workspace created and switched.</p>}
      <button type="submit" disabled={pending} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
