"use client";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-card p-6 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground break-words">{error.message || "An unexpected error occurred."}</p>
      {error.digest && <p className="text-xs font-mono text-muted-foreground">Digest: {error.digest}</p>}
      <button onClick={() => reset()} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Try again
      </button>
    </div>
  );
}
