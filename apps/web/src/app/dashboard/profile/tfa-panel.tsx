"use client";

import { useActionState, useEffect, useState } from "react";
import { disableTfaAction, enableTfaConfirmAction, enableTfaStartAction } from "./tfa-actions";

export function TfaPanel({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [startState, startAction, startPending] = useActionState(enableTfaStartAction, undefined);
  const [confirmState, confirmAction, confirmPending] = useActionState(enableTfaConfirmAction, undefined);
  const [disableState, disableAction, disablePending] = useActionState(disableTfaAction, undefined);

  useEffect(() => {
    if (startState?.secret) {
      setPendingSecret(startState.secret);
      setPendingUri(startState.uri ?? null);
    }
  }, [startState]);

  useEffect(() => {
    if (confirmState?.ok) {
      setEnabled(true);
      setPendingSecret(null);
      setPendingUri(null);
    }
  }, [confirmState]);

  useEffect(() => {
    if (disableState?.ok) setEnabled(false);
  }, [disableState]);

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">Two-factor authentication</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {enabled ? "Enabled — sign-in requires a 6-digit code." : "Add a time-based one-time password from any authenticator app."}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${enabled ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
          {enabled ? "on" : "off"}
        </span>
      </div>

      {!enabled && !pendingSecret && (
        <form action={startAction} className="mt-4">
          <button
            type="submit"
            disabled={startPending}
            className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {startPending ? "Generating…" : "Set up authenticator"}
          </button>
          {startState?.error && <p role="alert" className="mt-2 text-sm text-destructive">{startState.error}</p>}
        </form>
      )}

      {pendingSecret && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Scan this URI with your authenticator app (or enter the secret manually):
          </p>
          <code className="block break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">{pendingUri}</code>
          <p className="text-xs text-muted-foreground">
            Secret: <code className="rounded bg-muted px-1 py-0.5 font-mono">{pendingSecret}</code>
          </p>
          <form action={confirmAction} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="tfa-code" className="text-sm font-medium">
                Verify code
              </label>
              <input
                id="tfa-code"
                name="code"
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                placeholder="000000"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={confirmPending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {confirmPending ? "Checking…" : "Enable"}
            </button>
          </form>
          {confirmState?.error && <p role="alert" className="text-sm text-destructive">{confirmState.error}</p>}
        </div>
      )}

      {enabled && (
        <form action={disableAction} className="mt-4">
          <button
            type="submit"
            disabled={disablePending}
            className="inline-flex h-9 items-center justify-center rounded-md border border-destructive/30 px-4 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {disablePending ? "Disabling…" : "Disable 2FA"}
          </button>
          {disableState?.error && <p role="alert" className="mt-2 text-sm text-destructive">{disableState.error}</p>}
        </form>
      )}
    </div>
  );
}