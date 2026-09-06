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

const TYPE_BADGE: Record<string, string> = {
 delivered: "badge-ok",
 clicked: "badge-warn",
 subscribed: "badge-info",
 unsubscribed: "badge-danger",
};

/** Live delivery feed — SSE from /api/live, dense console rows. */
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
  <div className="panel">
   <div className="panel-head">
    <p className="panel-title">Live activity</p>
    <span role="status" className={`badge ${connected ? "badge-ok" : "badge-neutral"}`}>
     <span className={`badge-dot livedot ${connected ? "pulsing" : ""}`} aria-hidden />
     {connected ? "live" : "reconnecting…"}
    </span>
   </div>
   <div className="p-2">
    {events.length === 0 ? (
     <p className="px-2 py-3 text-[13px] text-[var(--ink-2)]">
      Watching for deliveries, clicks and subscriptions…
     </p>
    ) : (
     <ul className="text-[13px]">
      {events.map((e) => (
       <li key={e.id} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-[7px] transition-colors hover:bg-[var(--muted)]">
        <span className={`badge ${TYPE_BADGE[e.type] ?? "badge-neutral"}`}>
         {TYPE_LABEL[e.type] ?? e.type}
        </span>
        {e.type === "clicked" && e.meta_json && <SendText meta={e.meta_json} />}
        <span className="tabular ml-auto shrink-0 font-mono text-[11.5px] text-[var(--ink-3)]">
         {new Date(e.ts).toLocaleTimeString()}
        </span>
       </li>
      ))}
     </ul>
    )}
   </div>
  </div>
 );
}

function SendText({ meta }: { meta: string }) {
 try {
  const parsed = JSON.parse(meta) as { target_url?: string | null; action?: string | null };
  return (
   <span className="min-w-0 flex-1 truncate text-[var(--ink-2)]">
    {parsed.action ?? parsed.target_url ?? "—"}
   </span>
  );
 } catch {
  return null;
 }
}
