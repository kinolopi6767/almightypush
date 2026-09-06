"use client";

import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
 useEffect(() => {
  // Premium error logging — structured for observability
  console.error("[pushpanel:error] dashboard boundary", {
   message: error.message,
   digest: error.digest,
   stack: error.stack?.slice(0, 2000),
   timestamp: new Date().toISOString(),
  });
 }, [error]);

 return (
  <div className="panel mx-auto max-w-lg p-8 text-center" role="alert" aria-live="assertive">
   <span
    aria-hidden
    className="mx-auto mb-5 flex size-12 items-center justify-center rounded-md border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[var(--danger-wash)] text-[var(--danger)]"
   >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-6">
     <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
    </svg>
   </span>
   <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
   <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground text-pretty">
    {error.message || "An unexpected error occurred. Your data is safe — this is a display issue."}
   </p>
   {error.digest && <p className="mt-3 font-mono text-xs text-muted-foreground/70 break-all">Digest: {error.digest}</p>}
    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
     <button
      onClick={() => reset()}
      className="btn btn-primary"
     >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" /></svg>
      Try again
     </button>
     <a
      href="/dashboard"
      className="btn btn-secondary"
     >
      Go to dashboard
     </a>
    </div>
   <p className="mt-4 text-xs text-muted-foreground">If this persists, check <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/api/health</code> or server logs.</p>
  </div>
 );
}
