"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createDomainAction, type DomainFormState } from "./actions";

export function DomainForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<DomainFormState, FormData>(createDomainAction, undefined);

  useEffect(() => {
    if (state?.ok && state.id) router.push(`/dashboard/domains/${state.id}`);
  }, [state, router]);

  return (
    <form action={formAction} className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Add domain</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A VAPID keypair is generated automatically. Deliveries are signed per domain.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="name" className="text-sm font-medium">
            Hostname
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="app.example.com"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="url" className="text-sm font-medium">
            Site URL (optional)
          </label>
          <input
            id="url"
            name="url"
            type="url"
            placeholder="https://app.example.com"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {state?.error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create domain"}
        </button>
      </div>
    </form>
  );
}
