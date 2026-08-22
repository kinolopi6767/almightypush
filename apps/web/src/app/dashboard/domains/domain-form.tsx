"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createDomainAction, type DomainFormState } from "./actions";

/** Mirror of the server-side sanitizer for instant feedback. */
function sanitizeHostname(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^[^/@]*@/, "")
    .split(/[/?#]/)[0] ?? ""
    .replace(/:\d{1,5}$/, "");
}

export function DomainForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<DomainFormState, FormData>(createDomainAction, undefined);

  useEffect(() => {
    if (state?.ok && state.id) router.push(`/dashboard/domains/${state.id}`);
  }, [state, router]);

  return (
    <form action={formAction} className="h-fit rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
      <h2 className="font-semibold tracking-tight">Add domain</h2>
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
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="app.example.com"
            onChange={(e) => {
              // Live-sanitize pasted URLs so the field always shows a hostname.
              const cleaned = e.target.value;
              const sanitized = sanitizeHostname(cleaned);
              if (cleaned !== sanitized && /[/:@\s]/.test(cleaned)) e.target.value = sanitized;
            }}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">Any TLD works — .com, .online, .io, subdomains…</p>
        </div>
        <div>
          <label htmlFor="url" className="text-sm font-medium">
            Site URL <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="url"
            name="url"
            type="url"
            placeholder="https://app.example.com"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
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
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-all hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
        >
          {pending && (
            <span
              aria-hidden
              className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
            />
          )}
          {pending ? "Creating…" : "Create domain"}
        </button>
      </div>
    </form>
  );
}
