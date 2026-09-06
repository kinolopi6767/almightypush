"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/dashboard/team/actions";

export function InviteAcceptForm({ token, email, role }: { token: string; email?: string; role?: string }) {
 const [state, action, pending] = useActionState(acceptInviteAction, undefined);

 return (
  <form action={action} className="space-y-4">
   <input type="hidden" name="token" value={token} />
   <p className="form-note">
    Invited as <span className="font-medium text-[var(--ink)]">{email}</span> · role <span className="font-medium capitalize text-[var(--ink)]">{role}</span>
   </p>
   <div className="space-y-1.5">
    <label htmlFor="name" className="label">Name</label>
    <input id="name" name="name" required autoComplete="name" placeholder="Jane Doe" className="input" />
   </div>
   <div className="space-y-1.5">
    <label htmlFor="password" className="label">Password</label>
    <input
     id="password"
     name="password"
     type="password"
     required
     minLength={10}
     autoComplete="new-password"
     placeholder="At least 10 characters"
     className="input"
    />
   </div>
   {state?.error && (
    <p role="alert" className="form-alert">{state.error}</p>
   )}
   {state?.ok && (
    <p className="form-note">
     <span className="badge badge-ok">Account created</span>
     <span className="ml-2">You can sign in now.</span>
    </p>
   )}
   <button
    type="submit"
    disabled={pending}
    className="btn btn-primary w-full"
   >
    {pending ? "Creating account…" : "Create account & join"}
   </button>
  </form>
 );
}
