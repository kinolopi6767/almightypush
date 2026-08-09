"use client";

import { useActionState } from "react";
import { sendTestPushAction, type DomainFormState } from "./actions";

export function TestPushForm({ domainId }: { domainId: number }) {
  const [state, formAction, pending] = useActionState<DomainFormState, FormData>(
    sendTestPushAction.bind(null, domainId),
    undefined,
  );

  return (
    <form action={formAction} className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Send test push</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Creates a quick campaign and queues a delivery for every active subscriber. The worker sends them with your
        VAPID keypair.
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
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {state?.ok && state.count ? (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            Queued {state.count} push(es) for delivery.
          </p>
        ) : state?.error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Queuing…" : "Send test push"}
        </button>
      </div>
    </form>
  );
}
