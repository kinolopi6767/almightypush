"use client";

import { useTransition } from "react";
import { deleteJourneyAction, pauseJourneyAction } from "./actions";

export function JourneyRowActions({ id, status }: { id: number; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await pauseJourneyAction(id); })}
        className="rounded-md border border-input px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
      >
        {status === "active" ? "Pause" : "Resume"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          if (!globalThis.confirm("Delete this journey? This cannot be undone.")) {
            e.preventDefault();
            return;
          }
          start(async () => { await deleteJourneyAction(id); });
        }}
        className="rounded-md border border-input px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
