"use client";

import { useActionState } from "react";
import { inviteTeamMemberAction, type TeamFormState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteTeamMemberAction, undefined as TeamFormState);
  return (
    <form action={action} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Invite member</h3>
      <div className="flex gap-2">
        <input name="email" type="email" placeholder="teammate@example.com" required className="h-9 flex-1 rounded-md border px-3 text-sm" />
        <select name="role" defaultValue="viewer" className="h-9 rounded-md border px-3 text-sm">
          <option value="viewer">viewer</option>
          <option value="editor">editor</option>
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </select>
        <button type="submit" disabled={pending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-600">Invite created — share token: <code className="rounded bg-muted px-1 font-mono text-xs">{state.token?.slice(0, 16)}…</code></p>}
    </form>
  );
}
