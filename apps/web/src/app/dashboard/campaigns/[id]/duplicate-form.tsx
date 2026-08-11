"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { duplicateCampaignAction, type CampaignFormState } from "../actions";

/**
 * Quick push (B8): reuses a campaign's payload + audience and fires it now.
 */
export function DuplicateCampaignForm({ campaignId }: { campaignId: number }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(
    async () => {
      const result = await duplicateCampaignAction(campaignId);
      if (result?.ok && result.id) router.push(`/dashboard/campaigns/${result.id}`);
      return result;
    },
    undefined,
  );

  return (
    <form action={formAction} className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Send again</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Copies this campaign&apos;s message, buttons and audience and delivers it to the current subscribers now.
      </p>
      {state?.error && (
        <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Copying…" : "Send again"}
      </button>
    </form>
  );
}
