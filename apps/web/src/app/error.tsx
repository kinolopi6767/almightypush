"use client";

import { useEffect } from "react";

/** Root error boundary — login/setup/invite/landing errors previously fell
 *  through to the unstyled Next.js default page. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[pushpanel:error] root boundary", {
      message: error.message,
      digest: error.digest,
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-8 text-center" role="alert" aria-live="assertive">
      <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
        An unexpected error occurred. Your data is safe — this is a display issue.
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-muted-foreground/70 break-all">Digest: {error.digest}</p>}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button onClick={() => reset()} className="btn btn-primary" type="button">
          Try again
        </button>
        <a href="/" className="btn btn-secondary">
          Back to home
        </a>
      </div>
    </div>
  );
}
