"use client";

import { useEffect, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAutomationAction, runAutomationNowAction, toggleAutomationAction } from "./actions";

export function AutomationRow({
 id,
 status,
 type,
 secret,
}: {
 id: number;
 status: string;
 type: string;
 secret: string | null;
}) {
 const router = useRouter();

 return (
  <div className="flex flex-wrap items-center gap-2">
   {type === "push_on_publish" && secret && (
    <WebhookBadge automationId={id} secret={secret} />
   )}
   {type !== "welcome_push" && status === "active" && (
    <ActionButton
     label="Run now"
     pendingLabel="Running…"
     onClick={async () => { await runAutomationNowAction(id); router.refresh(); }}
    />
   )}
   <ActionButton
    label={status === "active" ? "Pause" : "Resume"}
    pendingLabel={status === "active" ? "Pausing…" : "Resuming…"}
    onClick={async () => { await toggleAutomationAction(id); router.refresh(); }}
   />
   <DeleteButton id={id} />
  </div>
 );
}

function WebhookBadge({ automationId, secret }: { automationId: number; secret: string }) {
 const url = `/api/v1/automations/${automationId}/trigger`;
 return (
  <details className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
   <summary className="cursor-pointer">Webhook</summary>
   <p className="mt-1 break-all font-mono">POST {url}</p>
   <p className="mt-1 break-all font-mono">X-PushPanel-Signature: sha256=…</p>
   <p className="mt-1 break-all font-mono" data-testid={`webhook-secret-${automationId}`}>{secret}</p>
  </details>
 );
}

/**
 * Pending-guarded action button. Without it, a rapid double-click on
 * "Pause" fires the toggle twice: the second call reads the NEW status and
 * flips it right back — the click appears to do nothing.
 */
function ActionButton({ label, pendingLabel, onClick }: { label: string; pendingLabel: string; onClick: () => Promise<void> }) {
 const [pending, startTransition] = useTransition();
 return (
  <button
   type="button"
   disabled={pending}
   aria-busy={pending}
   onClick={() => {
    startTransition(async () => {
     await onClick();
    });
   }}
   className="btn btn-secondary btn-sm"
  >
   {pending ? pendingLabel : label}
  </button>
 );
}

function DeleteButton({ id }: { id: number }) {
 const router = useRouter();
 const [state, action, pending] = useActionState(() => deleteAutomationAction(id), undefined);

 useEffect(() => {
  if (state?.ok) router.refresh();
 }, [state, router]);

 return (
  <button
   type="button"
   onClick={() => {
    if (!window.confirm("Delete this automation?")) return;
    void action();
   }}
   disabled={pending}
   className="btn btn-danger-ghost btn-sm"
  >
   Delete
  </button>
 );
}
