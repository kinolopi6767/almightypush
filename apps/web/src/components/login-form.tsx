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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/15 to-transparent" />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-base font-bold text-primary-foreground shadow-lg shadow-primary/25">
            P
          </span>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to PushPanel</h1>
            <p className="text-sm text-muted-foreground">Your self-hosted push notification panel</p>
          </div>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border bg-card/90 p-6 shadow-xl shadow-black/5 backdrop-blur dark:shadow-black/20"
        >
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
              placeholder="you@example.com"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-all hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {pending ? "Please wait…" : needsTotp ? "Verify code" : "Sign in"}
          </button>
        </form>
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
