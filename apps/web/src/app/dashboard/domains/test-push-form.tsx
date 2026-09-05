"use client";

import { useActionState } from "react";
import { sendTestPushAction, type DomainFormState } from "./actions";

export function TestPushForm({ domainId }: { domainId: number }) {
  const [state, formAction, pending] = useActionState<DomainFormState, FormData>(
    sendTestPushAction.bind(null, domainId),
    undefined,
  );

  return (
    <form action={formAction} className="surface rounded-xl p-5">
       <h2 className="text-[15px] font-semibold tracking-tight">Send test push</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Queues a quick campaign to the <strong>25 most recent</strong> active subscribers (safety cap — full sends
        belong in Campaigns). The worker delivers them with your VAPID keypair.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={120}
            placeholder="Hello from PushPanel"
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
          />
        </div>
        <div>
          <label htmlFor="message" className="text-sm font-medium">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            maxLength={500}
            rows={2}
            placeholder="This notification was delivered end-to-end."
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
          />
        </div>
        <div>
          <label htmlFor="url" className="text-sm font-medium">
            Click URL
          </label>
          <input
            id="url"
            name="url"
            type="url"
            placeholder="https://app.example.com/post/1"
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
          />
        </div>
        {state?.ok && state.count ? (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            Queued {state.count} push(es) for delivery.
          </p>
        ) : state?.error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-[background-color,box-shadow,transform] hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Queuing…" : "Send test push"}
        </button>
      </div>
    </form>
  );
}
