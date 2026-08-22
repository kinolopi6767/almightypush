"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { unsubscribeSubscriberAction } from "./actions";

export function UnsubscribeButton({ domainId, subscriberId }: { domainId: number; subscriberId: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(() => unsubscribeSubscriberAction(domainId, subscriberId), undefined);

  // Refresh the row as soon as the action succeeds (not on dialog cancel).
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (state?.error) {
    return <span className="text-xs text-destructive">{state.error}</span>;
  }

  return (
    <button
      onClick={() => {
        if (!state?.ok && window.confirm("Unsubscribe this subscriber?")) void action();
      }}
      disabled={pending || Boolean(state?.ok)}
      className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      {pending ? "…" : state?.ok ? "Unsubscribed" : "Unsubscribe"}
    </button>
  );
}
