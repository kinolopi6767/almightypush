"use client";

import { useEffect, useState } from "react";

interface LiveEvent {
  id: number;
  type: string;
  campaign_id: number | null;
  meta_json: string | null;
  ts: string;
}

const TYPE_LABEL: Record<string, string> = {
  delivered: "delivered",
  clicked: "clicked",
  subscribed: "subscribed",
  unsubscribed: "unsubscribed",
};

const TYPE_DOT: Record<string, string> = {
  delivered: "bg-emerald-500",
  clicked: "bg-amber-500",
  subscribed: "bg-sky-500",
  unsubscribed: "bg-destructive",
};

const TYPE_BADGE: Record<string, string> = {
  clicked: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  subscribed: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

/**
 * Live delivery feed — subscribes to /api/live (SSE) and renders the most
 * recent activity as it happens. EventSource reconnects automatically and
 * resumes from the last event id.
 */
export function LiveFeed({ limit = 20 }: { limit?: number }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/live");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (msg) => {
      try {
        const row = JSON.parse(msg.data) as LiveEvent;
        setEvents((prev) => [...prev.filter((e) => e.id !== row.id), row].slice(-limit));
      } catch {
        // non-JSON keepalive — ignore
      }
    };
    return () => source.close();
  }, [limit]);

  return (
    <div className="surface rounded-xl p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Live activity</h2>
        <span
          role="status"
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            connected
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${connected ? "bg-current pulse-dot" : "bg-muted-foreground/40"}`}
            aria-hidden
          />
          {connected ? "live" : "reconnecting…"}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Watching for deliveries, clicks and subscriptions…
        </p>
      ) : (
        <ul className="mt-3 space-y-0.5 text-[13px]">
          {events.map((e) => (
            <li key={e.id} className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-accent/60">
              <span className={`size-1.5 shrink-0 rounded-full ${TYPE_DOT[e.type] ?? "bg-muted-foreground"}`} aria-hidden />
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  TYPE_BADGE[e.type] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {TYPE_LABEL[e.type] ?? e.type}
              </span>
              {e.type === "clicked" && e.meta_json && <SendText meta={e.meta_json} />}
              <span className="ml-auto shrink-0 text-xs tabular text-muted-foreground">
                {new Date(e.ts).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Renders the clicked target (or button label) from the event metadata. */
function SendText({ meta }: { meta: string }) {
  try {
    const parsed = JSON.parse(meta) as { target_url?: string | null; action?: string | null };
    return (
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {parsed.action ?? parsed.target_url ?? "—"}
      </span>
    );
  } catch {
    return null;
  }
}
