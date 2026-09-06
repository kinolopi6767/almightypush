"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createDomainAction, type DomainFormState } from "./actions";

function sanitizeHostname(raw: string): string {
 return raw
  .trim()
  .toLowerCase()
  .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
  .replace(/^[^/@]*@/, "")
  .split(/[/?#]/)[0] ?? ""
  .replace(/:\d{1,5}$/, "");
}

export function DomainForm() {
 const router = useRouter();
 const [state, formAction, pending] = useActionState<DomainFormState, FormData>(createDomainAction, undefined);

 useEffect(() => {
  if (state?.ok && state.id) router.push(`/dashboard/domains/${state.id}`);
 }, [state, router]);

 return (
  <form action={formAction} className="panel h-fit">
   <div className="panel-head">
    <p className="panel-title">Add domain</p>
    <span className="badge badge-neutral">VAPID auto</span>
   </div>
   <div className="panel-body space-y-3.5">
    <p className="hint">
     A VAPID keypair is generated automatically. Deliveries are signed per domain.
    </p>
    <div className="space-y-1.5">
     <label htmlFor="name" className="label">
      Hostname
     </label>
     <input
      id="name"
      name="name"
      required
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder="app.example.com"
      onChange={(e) => {
       const cleaned = e.target.value;
       const sanitized = sanitizeHostname(cleaned);
       if (cleaned !== sanitized && /[/:@\s]/.test(cleaned)) e.target.value = sanitized;
      }}
      className="input font-mono"
     />
     <p className="hint">Any TLD works — .com, .online, .io, subdomains…</p>
    </div>
    <div className="space-y-1.5">
     <label htmlFor="url" className="label">
      Site URL <span className="font-normal text-[var(--ink-3)]">(optional)</span>
     </label>
     <input
      id="url"
      name="url"
      type="url"
      placeholder="https://app.example.com"
      className="input"
     />
    </div>
    {state?.error && (
     <p role="alert" className="form-alert">
      {state.error}
     </p>
    )}
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
     {pending && (
      <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
     )}
     {pending ? "Creating…" : "Create domain"}
    </button>
   </div>
  </form>
 );
}
