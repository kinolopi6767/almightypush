"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { duplicateCampaignAction, resendToNonClickersAction, type CampaignFormState } from "../actions";

/**
 * Quick push (B8): reuses a campaign's payload + audience and fires it now.
 * Retarget (P1): resend only to recipients who never clicked the original.
 */
export function DuplicateCampaignForm({ campaignId, canRetarget }: { campaignId: number; canRetarget: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(
    async (_prev, formData) => {
      const intent = String(formData.get("intent") ?? "duplicate");
      const result =
        intent === "non_clickers" ? await resendToNonClickersAction(campaignId) : await duplicateCampaignAction(campaignId);
      if (result?.ok && result.id) router.push(`/dashboard/campaigns/${result.id}`);
      return result;
    },
    undefined,
  );

  return (
    <form action={formAction} className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Send again</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Copies this campaign&apos;s message and buttons and delivers it now.
      </p>
      {state?.error && (
        <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="duplicate"
          disabled={pending}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-all hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Working…" : "Send again"}
        </button>
        {canRetarget && (
          <button
            type="submit"
            name="intent"
            value="non_clickers"
            disabled={pending}
            title="Resend only to subscribers who received this campaign but never clicked it"
            className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            Resend to non-clickers
          </button>
        )}
      </div>
    </form>
  );
}
