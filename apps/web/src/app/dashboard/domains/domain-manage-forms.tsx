"use client";

import { useActionState } from "react";
import { cloneDomainAction, deleteDomainAction, setDomainStatusAction, type DomainFormState } from "./actions";

export function DomainStatusForm({ domainId, status }: { domainId: number; status: string }) {
  const paused = status === "paused";
  const [state, formAction, pending] = useActionState<DomainFormState, FormData>(
    () => setDomainStatusAction(domainId, paused ? "active" : "paused"),
    undefined,
  );

  return (
    <form action={formAction} className="panel p-4">
      <h2 className="text-[15px] font-semibold tracking-tight">{paused ? "Resume domain" : "Pause domain"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {paused
          ? "Resume sending: scheduled campaigns start and queued deliveries flow again. Nothing queued was lost."
          : "Pause everything: new campaigns won't start, queued deliveries wait (nothing is lost), and new subscriptions are refused. Unsubscribe keeps working."}
      </p>
      {state?.ok ? (
        <p className="mt-3 form-ok">{paused ? "Domain resumed." : "Domain paused."}</p>
      ) : state?.error ? (
        <p role="alert" className="mt-3 form-alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-secondary mt-3">
        {pending ? "Saving…" : paused ? "Resume domain" : "Pause domain"}
      </button>
    </form>
  );
}

export function DeleteDomainForm({ domainId, name }: { domainId: number; name: string }) {
  const [state, formAction, pending] = useActionState<DomainFormState, FormData>(
    () => deleteDomainAction(domainId),
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="panel p-4">
        <p className="form-ok">Domain deleted.</p>
        <a href="/dashboard/domains" className="btn btn-secondary mt-3 inline-block">
          Back to domains
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="panel p-4">
      <h2 className="text-[15px] font-semibold tracking-tight">Delete domain</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Permanently deletes <span className="font-mono">{name}</span> with its campaigns, subscribers, automations
        and scoped API keys. Analytics history is kept. This cannot be undone.
      </p>
      {state?.error ? (
        <p role="alert" className="mt-3 form-alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!window.confirm(`Permanently delete ${name} and all its data?`)) {
            e.preventDefault();
          }
        }}
        className="btn btn-danger-ghost mt-3"
      >
        {pending ? "Deleting…" : "Delete domain"}
      </button>
    </form>
  );
}

export function CloneDomainForm({ domainId, name }: { domainId: number; name: string }) {
  const [state, formAction, pending] = useActionState<DomainFormState, FormData>(
    (_prev, formData) => cloneDomainAction(domainId, _prev, formData),
    undefined,
  );

  if (state?.ok && state.id) {
    return (
      <div className="panel p-4">
        <p className="form-ok">Domain cloned — prompt settings carried over with a fresh VAPID keypair.</p>
        <a href={`/dashboard/domains/${state.id}`} className="btn btn-secondary mt-3 inline-block">
          Open cloned domain
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="panel p-4">
      <h2 className="text-[15px] font-semibold tracking-tight">Clone domain config</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Copy <span className="font-mono">{name}</span>&apos;s prompt settings to a new hostname. A fresh VAPID
        keypair is minted — subscribers, campaigns and keys are never carried over.
      </p>
      <label htmlFor="clone-hostname" className="mt-3 block text-sm font-medium">
        New hostname
      </label>
      <input
        id="clone-hostname"
        name="name"
        required
        placeholder="app.example.com"
        autoComplete="off"
        spellCheck={false}
        className="input mt-1"
      />
      {state?.error ? (
        <p role="alert" className="mt-3 form-alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-secondary mt-3">
        {pending ? "Cloning…" : "Clone domain"}
      </button>
    </form>
  );
}
