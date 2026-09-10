"use client";

import { useActionState } from "react";
import { cancelCampaignAction, type CampaignFormState } from "../actions";

export function CancelCampaignForm({ campaignId, status }: { campaignId: number; status: string }) {
 const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(
  () => cancelCampaignAction(campaignId),
  undefined,
 );

 // The action revalidates the page, so `status` flips to cancelled before the
 // response lands. Keep the panel mounted after success so the confirmation
 // (and the result) stays visible; hide only when there was never anything
 // to cancel and no success to report.
 const cancellable = ["draft", "scheduled", "sending"].includes(status);
 if (!cancellable && !state?.ok) return null;

 return (
  <form action={formAction} className="panel p-4">
   <h2 className="text-[15px] font-semibold tracking-tight">Cancel campaign</h2>
   <p className="mt-1 text-sm text-muted-foreground">
    {cancellable
     ? "Marks the campaign as cancelled and drops any deliveries still queued."
     : "This campaign is cancelled — queued deliveries were dropped."}
   </p>
   {state?.ok ? (
    <p className="mt-3 form-ok">
     Campaign cancelled.
    </p>
   ) : state?.error ? (
    <p role="alert" className="mt-3 form-alert">
     {state.error}
    </p>
   ) : null}
   {cancellable && (
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
     className="btn btn-danger-ghost mt-3"
    >
     {pending ? "Cancelling…" : "Cancel campaign"}
    </button>
   )}
  </form>
 );
}
