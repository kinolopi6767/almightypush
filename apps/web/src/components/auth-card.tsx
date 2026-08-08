"use client";

import { useActionState, useEffect } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

interface AuthCardProps {
  title: string;
  description: string;
  action: (prev: { error?: string; ok?: boolean } | undefined, formData: FormData) => Promise<{ error?: string; ok?: boolean }>;
  footer?: ReactNode;
  children: ReactNode;
  submitLabel: string;
  /** URL to navigate to after a successful action (e.g. first-run setup → /login). */
  onSuccess?: string;
}

export function AuthCard({ title, description, action, footer, children, submitLabel, onSuccess }: AuthCardProps) {
  const [state, formAction, pending] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.ok && onSuccess) {
      window.location.assign(onSuccess);
    }
  }, [state, onSuccess]);

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <form action={formAction} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          {children}
          {state?.error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {pending ? "Please wait…" : submitLabel}
          </button>
        </form>
        {footer}
        <p className="text-center text-xs text-muted-foreground">
          Self-hosted web push ·{" "}
          <Link href="/api/health" className="underline">
            health
          </Link>
        </p>
      </div>
    </div>
  );
}