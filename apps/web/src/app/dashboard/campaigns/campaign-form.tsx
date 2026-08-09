"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction, type CampaignFormState } from "./actions";

export function CampaignForm({ domains }: { domains: { id: number; name: string }[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(createCampaignAction, undefined);

  useEffect(() => {
    if (state?.ok && state.id) router.push(`/dashboard/campaigns/${state.id}`);
  }, [state, router]);

  return (
    <form action={formAction} className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">New campaign</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The worker starts the campaign the moment it is due and queues a delivery for every active subscriber.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="domainId" className="text-sm font-medium">
            Domain
          </label>
          <select
            id="domainId"
            name="domainId"
            required
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select a domain…</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={120}
            placeholder="Big sale this weekend"
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
            placeholder="Everything is 50% off until Sunday."
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
            placeholder="https://app.example.com/sale"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="schedule" className="text-sm font-medium">
            Schedule (optional)
          </label>
          <input
            id="schedule"
            name="schedule"
            type="datetime-local"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">Leave empty to send immediately.</p>
        </div>
        {state?.error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create campaign"}
        </button>
      </div>
    </form>
  );
}
