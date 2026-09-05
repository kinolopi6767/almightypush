"use client";

import { useActionState, useState } from "react";
import {
  cleanUnsubscribedAction,
  importSubscribersAction,
  type SubscriberActionState,
} from "./actions";

function Result({ state }: { state: SubscriberActionState }) {
  if (!state) return null;
  if (state.error) {
    return <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>;
  }
  if (state.imported !== undefined) {
    return (
      <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        Imported {state.imported}, skipped {state.skipped}, invalid {state.invalid}.
      </p>
    );
  }
  if (state.deleted !== undefined) {
    return (
      <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        Removed {state.deleted} unsubscribed {state.deleted === 1 ? "subscriber" : "subscribers"}.
      </p>
    );
  }
  return null;
}

export function SubscribersTools({ domainId }: { domainId: number }) {
  const [importState, importAction, importing] = useActionState(importSubscribersAction.bind(null, domainId), undefined);
  const [cleanState, cleanAction, cleaning] = useActionState(() => cleanUnsubscribedAction(domainId), undefined);
  const [exportError, setExportError] = useState<string | null>(null);
  // Streaming download via the export endpoint — navigation, so the browser
  // owns progress; the brief disabled state prevents double-click double-downloads.
  const [exporting, setExporting] = useState(false);

  const download = () => {
    setExportError(null);
    setExporting(true);
    // Navigate to the streaming endpoint; reset after a generous window so
    // the button recovers even if the download dialog is cancelled.
    window.location.href = `/api/export/subscribers-roundtrip?domainId=${domainId}`;
    setTimeout(() => setExporting(false), 4_000);
  };

  return (
    <div className="space-y-3">
      {exportError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{exportError}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={download}
          disabled={exporting}
          aria-busy={exporting}
          className="inline-flex h-9 items-center rounded-lg bg-secondary px-4 text-sm font-medium transition-colors hover:bg-secondary/80 disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
        <form action={importAction} className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".csv,.jsonl,.json,text/csv,application/json"
            required
            aria-label="Import file"
            className="block w-64 text-sm text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={importing}
            aria-busy={importing}
            className="inline-flex h-9 items-center rounded-lg bg-secondary px-4 text-sm font-medium transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </form>

        <button
          onClick={() => {
            if (window.confirm("Permanently delete all unsubscribed subscribers for this domain?")) {
              void cleanAction();
            }
          }}
          disabled={cleaning}
          aria-busy={cleaning}
          className="inline-flex h-9 items-center rounded-lg bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
        >
          {cleaning ? "Cleaning…" : "Clean unsubscribed"}
        </button>
      </div>

      <Result state={importState} />
      <Result state={cleanState} />
    </div>
  );
}
