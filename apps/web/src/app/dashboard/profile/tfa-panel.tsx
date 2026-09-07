"use client";

import { useActionState, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
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
  <div className="panel p-4">
   <div className="flex items-center justify-between">
    <div>
     <p className="font-semibold">Two-factor authentication</p>
     <p className="mt-0.5 text-sm text-muted-foreground">
      {enabled ? "Enabled — sign-in requires a 6-digit code." : "Add a time-based one-time password from any authenticator app."}
     </p>
    </div>
    <span className={`badge ${enabled ? "badge-ok" : "badge-neutral"}`}>
     {enabled ? "on" : "off"}
    </span>
   </div>

   {!enabled && !pendingSecret && (
    <form action={startAction} className="mt-4 space-y-3">
     <div>
      <label htmlFor="tfa-setup-password" className="text-sm font-medium">
       Confirm current password
      </label>
      <input
       id="tfa-setup-password"
       name="password"
       type="password"
       required
       autoComplete="current-password"
       className="input mt-1"
       placeholder="Required to set up 2FA"
      />
     </div>
     <button
      type="submit"
      disabled={startPending}
      className="btn btn-secondary"
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
     <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">{pendingUri}</code>
      <CopyButton value={pendingUri ?? ""} label="Copy" />
     </div>
     <p className="text-xs text-muted-foreground">
      Secret: <code className="rounded bg-muted px-1 py-0.5 font-mono">{pendingSecret}</code>
      <CopyButton value={pendingSecret ?? ""} label="Copy secret" className="ml-1.5" />
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
        autoComplete="one-time-code"
        placeholder="000000"
        className="input mt-1 font-mono"
       />
      </div>
      <button
       type="submit"
       disabled={confirmPending}
       className="btn btn-primary"
      >
       {confirmPending ? "Checking…" : "Enable"}
      </button>
     </form>
     {confirmState?.error && <p role="alert" className="text-sm text-destructive">{confirmState.error}</p>}
    </div>
   )}

   {enabled && (
    <form action={disableAction} className="mt-4 space-y-2">
     <div className="flex items-end gap-2">
      <div className="flex-1">
       <label htmlFor="tfa-disable-password" className="text-sm font-medium">
        Current password
       </label>
       <input
        id="tfa-disable-password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
       />
      </div>
      <button
       type="submit"
       disabled={disablePending}
       className="btn btn-danger-ghost"
      >
       {disablePending ? "Disabling…" : "Disable 2FA"}
      </button>
     </div>
     {disableState?.error && <p role="alert" className="text-sm text-destructive">{disableState.error}</p>}
    </form>
   )}
  </div>
 );
}