"use client";

import { CopyButton } from "@/components/copy-button";

import { useActionState } from "react";
import { createApiKeyAction, revokeApiKeyAction, type ApiKeyFormState } from "./actions";

function Status({ state }: { state: ApiKeyFormState }) {
 if (!state) return null;
 if (state.error) return <p className="form-alert">{state.error}</p>;
 return null;
}

export function CreateApiKeyForm({
 domains,
 disabled,
}: {
 domains: { id: number; name: string }[];
 disabled: boolean;
}) {
 const [state, action, pending] = useActionState<ApiKeyFormState, FormData>(createApiKeyAction, undefined);

 if (state?.plaintext) {
  return (
   <div className="panel p-4">
    <h2 className="text-[15px] font-semibold tracking-tight">Key created — copy it now</h2>
    <p className="mb-2 mt-1 text-xs text-destructive">
     This is the only time the plaintext is shown. Lost keys must be revoked and recreated.
    </p>
    <div className="flex items-center gap-2">
     <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-2 font-mono text-xs">{state.plaintext}</code>
     <CopyButton value={state.plaintext} label="Copy" className="btn btn-primary" />
    </div>
   </div>
  );
 }

 return (
  <form action={action} className="space-y-3 rounded-md border bg-card p-4">
   <h2 className="text-[15px] font-semibold tracking-tight">Create key</h2>
   <Status state={state} />
   <div>
    <label htmlFor="keyLabel" className="text-xs font-medium text-muted-foreground">
     Label
    </label>
    <input
     id="keyLabel"
     name="label"
     required
     maxLength={64}
     placeholder="Production"
     disabled={disabled}
     className="input"
    />
   </div>
   <div>
    <label htmlFor="keyDomain" className="text-xs font-medium text-muted-foreground">
     Domain scope
    </label>
    <select id="keyDomain" name="domainId" disabled={disabled} className="input">
     <option value="">All domains</option>
     {domains.map((d) => (
      <option key={d.id} value={d.id}>
       {d.name}
      </option>
     ))}
    </select>
   </div>
   <div>
    <label htmlFor="keyExpiry" className="text-xs font-medium text-muted-foreground">
     Expiry (optional)
    </label>
    <input
     id="keyExpiry"
     name="expiresAt"
     type="datetime-local"
     disabled={disabled}
     className="input"
    />
   </div>
   <button
    type="submit"
    disabled={disabled || pending}
    className="btn btn-primary"
   >
    {pending ? "Creating…" : "Create key"}
   </button>
   {disabled && <p className="text-xs text-amber-600 dark:text-amber-400">Enable API access in Settings to create keys.</p>}
  </form>
 );
}

export function RevokeApiKeyButton({ keyId, label }: { keyId: number; label: string }) {
 const [state, action, pending] = useActionState<ApiKeyFormState, FormData>(
  (_prev: ApiKeyFormState, _formData: FormData) => revokeApiKeyAction(keyId),
  undefined,
 );
 return (
  <div className="flex shrink-0 items-center gap-2">
   {state?.error && <span className="text-xs text-destructive">{state.error}</span>}
   <form action={action}>
    <button
     type="submit"
     disabled={pending}
     onClick={(e) => {
      if (!globalThis.confirm(`Revoke key "${label}"? Requests using it will stop working immediately.`)) {
       e.preventDefault();
      }
     }}
     className="rounded-md border border-input px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
    >
     {pending ? "Revoking…" : "Revoke"}
    </button>
   </form>
  </div>
 );
}