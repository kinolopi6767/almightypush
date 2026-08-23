"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/dashboard/team/actions";

export function InviteAcceptForm({ token, email, role }: { token: string; email?: string; role?: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        Invited as <span className="font-medium">{email}</span> · role <span className="font-medium capitalize">{role}</span>
      </p>
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">Name</label>
        <input id="name" name="name" required autoComplete="name" placeholder="Jane Doe" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          placeholder="At least 10 characters"
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Account created — you can sign in now.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-all hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account & join"}
      </button>
    </form>
  );
}
