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
    <div className="app-shell relative flex min-h-svh items-center justify-center px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "var(--auth-glow)" }} />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-base font-bold text-primary-foreground shadow-[0_8px_24px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
            P
          </span>
          <div className="space-y-1.5">
            <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <form action={formAction} className="surface space-y-4 rounded-xl p-6" style={{ boxShadow: "var(--shadow-pop)" }}>
          {children}
          {state?.error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-[background-color,box-shadow,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
          >
            {pending && (
              <span
                aria-hidden
                className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
              />
            )}
            {pending ? "Please wait…" : submitLabel}
          </button>
        </form>
        {footer}
        <p className="text-center text-xs text-muted-foreground">
          Self-hosted web push ·{" "}
          <Link href="/api/health" className="underline underline-offset-4 hover:text-foreground">
            health
          </Link>
        </p>
      </div>
    </div>
  );
}
