"use client";

import { useActionState } from "react";
import { inviteTeamMemberAction, type TeamFormState } from "./actions";
import { CopyButton } from "@/components/copy-button";

export function InviteForm() {
 const [state, action, pending] = useActionState(inviteTeamMemberAction, undefined as TeamFormState);
 // Absolute URL: a relative /invite/<token> pasted off-server is broken —
 // the recipient needs the panel origin included.
 const inviteUrl =
  typeof window !== "undefined" && state?.token ? `${window.location.origin}/invite/${state.token}` : null;

 return (
  <form action={action} className="panel space-y-3 p-4" aria-label="Invite member">
   <h3 className="text-[15px] font-semibold tracking-tight">Invite member</h3>
   <div className="flex flex-wrap gap-2">
    <div className="min-w-0 flex-1">
     <label htmlFor="invite-email" className="sr-only">Email</label>
     <input
      id="invite-email"
      name="email"
      type="email"
      autoComplete="email"
      spellCheck={false}
      placeholder="teammate@example.com…"
      required
      className="input"
     />
    </div>
    <div>
     <label htmlFor="invite-role" className="sr-only">Role</label>
     <select id="invite-role" name="role" defaultValue="viewer" className="input">
      <option value="viewer">Viewer</option>
      <option value="editor">Editor</option>
      <option value="admin">Admin</option>
      <option value="owner">Owner</option>
     </select>
    </div>
    <button
     type="submit"
     disabled={pending}
     className="btn btn-primary"
     aria-busy={pending}
    >
     {pending ? "Inviting…" : "Invite"}
    </button>
   </div>
   {state?.error && (
    <p role="alert" className="text-sm text-destructive">{state.error}</p>
   )}
   {state?.ok && inviteUrl && (
    <div role="status" className="form-ok space-y-2">
     <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Invite created — share this link (shown once):</p>
     <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">{inviteUrl}</code>
      <CopyButton value={inviteUrl} label="Copy link" />
     </div>
     <p className="text-xs text-muted-foreground">The recipient opens it to set their name and password. Expires in 7 days.</p>
    </div>
   )}
  </form>
 );
}
