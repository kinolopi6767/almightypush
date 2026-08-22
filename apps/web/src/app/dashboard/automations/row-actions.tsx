"use client";

import { useEffect, useActionState } from "react";
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
        <ActionButton label="Run now" onClick={async () => { await runAutomationNowAction(id); router.refresh(); }} />
      )}
      <ActionButton
        label={status === "active" ? "Pause" : "Resume"}
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

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted"
    >
      {label}
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
      className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium text-destructive transition-colors hover:bg-muted disabled:opacity-50"
    >
      Delete
    </button>
  );
}