"use client";

import { useActionState } from "react";
import {
  cleanUnsubscribedAction,
  exportSubscribersAction,
  importSubscribersAction,
  type SubscriberActionState,
} from "./actions";

function Result({ state }: { state: SubscriberActionState }) {
  if (!state) return null;
  if (state.error) {
    return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>;
  }
  if (state.imported !== undefined) {
    return (
      <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        Imported {state.imported}, skipped {state.skipped}, invalid {state.invalid}.
      </p>
    );
  }
  if (state.deleted !== undefined) {
    return (
      <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        Removed {state.deleted} unsubscribed {state.deleted === 1 ? "subscriber" : "subscribers"}.
      </p>
    );
  }
  return null;
}

export function SubscribersTools({ domainId }: { domainId: number }) {
  const [importState, importAction, importing] = useActionState(importSubscribersAction.bind(null, domainId), undefined);
  const [cleanState, cleanAction, cleaning] = useActionState(() => cleanUnsubscribedAction(domainId), undefined);

  const download = async () => {
    const result = await exportSubscribersAction(domainId);
    if (result?.csv) {
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename ?? "subscribers.csv";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void download()}
          className="inline-flex h-9 items-center rounded-md bg-secondary px-4 text-sm font-medium transition-colors hover:bg-secondary/80"
        >
          Export CSV
        </button>
        <form action={importAction} className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".csv,.jsonl,.json,text/csv,application/json"
            required
            className="block w-64 text-sm text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <button
            type="submit"
            disabled={importing}
            className="inline-flex h-9 items-center rounded-md bg-secondary px-4 text-sm font-medium transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            Import
          </button>
        </form>

        <button
          onClick={() => {
            if (window.confirm("Permanently delete all unsubscribed subscribers for this domain?")) {
              void cleanAction();
            }
          }}
          disabled={cleaning}
          className="inline-flex h-9 items-center rounded-md bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
        >
          Clean unsubscribed
        </button>
      </div>

      <Result state={importState} />
      <Result state={cleanState} />
    </div>
  );
}
