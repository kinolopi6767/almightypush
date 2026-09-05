"use client";

import { useActionState } from "react";
import { cancelCampaignAction, type CampaignFormState } from "../actions";

export function CancelCampaignForm({ campaignId, status }: { campaignId: number; status: string }) {
  const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(
    () => cancelCampaignAction(campaignId),
    undefined,
  );

  if (!["draft", "scheduled", "sending"].includes(status)) return null;

  return (
    <form action={formAction} className="surface rounded-xl p-5">
      <h2 className="text-[15px] font-semibold tracking-tight">Cancel campaign</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Marks the campaign as cancelled and drops any deliveries still queued.
      </p>
      {state?.ok ? (
        <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Campaign cancelled.
        </p>
      ) : state?.error ? (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          // Destructive + irreversible (queued deliveries are dropped) —
          // every other destructive action in the panel confirms too.
          if (!window.confirm("Cancel this campaign and drop its queued deliveries?")) {
            e.preventDefault();
          }
        }}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-input border-destructive/30 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Cancelling…" : "Cancel campaign"}
      </button>
    </form>
  );
}
