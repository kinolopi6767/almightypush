"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileFormState } from "./actions";

export function ProfileForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(
    (_prev: ProfileFormState, formData: FormData) => updateProfileAction(_prev, formData),
    undefined,
  );

  return (
    <form action={action} className="max-w-md space-y-4 rounded-lg border bg-card p-5">
      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={name}
          required
          className="h-9 w-full rounded-md border bg-card px-3 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="currentPassword" className="text-sm font-medium">
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="h-9 w-full rounded-md border bg-card px-3 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="newPassword" className="text-sm font-medium">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Leave blank to keep current"
          className="h-9 w-full rounded-md border bg-card px-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">At least 10 characters.</p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>

      {state?.ok && <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Profile updated.</p>}
      {state?.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
