"use client";

import { useActionState, useEffect } from "react";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth-shell";

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
    <AuthShell title={title} description={description}>
      <form action={formAction} className="auth-card space-y-4">
        {children}
        {state?.error && (
          <p role="alert" className="form-alert">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending && (
            <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
          )}
          {pending ? "Please wait…" : submitLabel}
        </button>
      </form>
      {footer}
    </AuthShell>
  );
}
