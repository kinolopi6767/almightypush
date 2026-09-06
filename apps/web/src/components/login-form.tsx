"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { checkTotpAction, loginAction } from "@/app/(auth)/actions";
import { AuthShell } from "@/components/auth-shell";

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
    <AuthShell title="Sign in to PushPanel" description="Your self-hosted push notification panel">
      <form onSubmit={handleSubmit} className="auth-card space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="label">
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
            className="input"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="input"
          />
        </div>
        {needsTotp && (
          <div className="space-y-1.5">
            <label htmlFor="totp" className="label">
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
              className="input text-center font-mono tracking-[0.3em]"
            />
            <p className="hint">Enter the 6-digit code from your authenticator app.</p>
          </div>
        )}
        {error && (
          <p role="alert" className="form-alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending && (
            <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
          )}
          {pending ? "Please wait…" : needsTotp ? "Verify code" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
