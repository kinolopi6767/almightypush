"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { checkTotpAction, loginAction } from "@/app/(auth)/actions";

export function LoginForm() {
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const needsTotpRef = useRef(false);

  const submit = useCallback(async (formData: FormData) => {
    setPending(true);
    setError(undefined);
    try {
      if (needsTotpRef.current) {
        const res = await loginAction(undefined, formData);
        if (res?.error) setError(res.error);
        return;
      }
      const check = await checkTotpAction(undefined, formData);
      if (check?.error) {
        setError(check.error);
        return;
      }
      if (check?.needsTotp) {
        needsTotpRef.current = true;
        setNeedsTotp(true);
        return;
      }
      const res = await loginAction(undefined, formData);
      if (res?.error) setError(res.error);
    } finally {
      setPending(false);
    }
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(new FormData(e.currentTarget));
  };

  return (
    <div className="app-shell relative flex min-h-svh items-center justify-center px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "var(--auth-glow)" }} />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-base font-bold text-primary-foreground shadow-[0_8px_24px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
            P
          </span>
          <div className="space-y-1.5">
            <h1 className="text-[22px] font-semibold tracking-tight">Sign in to PushPanel</h1>
            <p className="text-sm text-muted-foreground">Your self-hosted push notification panel</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="surface space-y-4 rounded-xl p-6 [box-shadow:var(--shadow-pop)]">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              spellCheck={false}
              placeholder="you@example.com"
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
            />
          </div>
          {needsTotp && (
            <div className="space-y-2">
              <label htmlFor="totp" className="text-sm font-medium">
                Authentication code
              </label>
              <input
                id="totp"
                name="totp"
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-center font-mono text-sm tracking-[0.3em] transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
              />
              <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-[background-color,box-shadow,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {pending && (
              <span
                aria-hidden
                className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
              />
            )}
            {pending ? "Please wait…" : needsTotp ? "Verify code" : "Sign in"}
          </button>
        </form>
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
