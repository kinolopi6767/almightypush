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
  <form action={formAction} className="panel p-4">
    <h2 className="text-[15px] font-semibold tracking-tight">Send again</h2>
   <p className="mt-1 text-sm text-muted-foreground">
    Copies this campaign&apos;s message and buttons and delivers it now.
   </p>
   {state?.error && (
    <p role="alert" className="mt-3 form-alert">
     {state.error}
    </p>
   )}
   <div className="mt-3 flex flex-wrap gap-2">
    <button
     type="submit"
     name="intent"
     value="duplicate"
     disabled={pending}
     className="btn btn-primary flex-1"
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
      className="btn btn-secondary flex-1"
     >
      Resend to non-clickers
     </button>
    )}
   </div>
  </form>
 );
}
