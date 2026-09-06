"use client";

import { useActionState } from "react";
import { retryFailedDeliveriesAction, type CampaignFormState } from "../actions";

export function RetryFailedForm({ campaignId, status, failedCount }: { campaignId: number; status: string; failedCount: number }) {
 const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(
  () => retryFailedDeliveriesAction(campaignId),
  undefined,
 );

 if (!["done", "failed"].includes(status) || failedCount === 0) return null;

 return (
  <form action={formAction} className="panel p-4">
   <h2 className="text-[15px] font-semibold tracking-tight">Retry failed deliveries</h2>
   <p className="mt-1 text-sm text-muted-foreground">
    {failedCount} {failedCount === 1 ? "delivery failed" : "deliveries failed"} (timeouts, provider errors). Requeue{" "}
    {failedCount === 1 ? "it" : "them"} with a fresh attempt budget.
   </p>
   {state?.ok ? (
    <p className="mt-3 form-ok">
     Requeued — the sender picks them up on the next cycle.
    </p>
   ) : state?.error ? (
    <p role="alert" className="mt-3 form-alert">
     {state.error}
    </p>
   ) : null}
   <button
    type="submit"
    disabled={pending}
    className="btn btn-secondary mt-3"
   >
    {pending ? "Requeueing…" : `Retry ${failedCount} failed`}
   </button>
  </form>
 );
}
