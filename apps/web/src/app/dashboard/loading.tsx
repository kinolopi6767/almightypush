export default function DashboardLoading() {
  return (
    <div className="rise space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-3">
        <div className="h-8 w-56 animate-pulse rounded-xl bg-muted shimmer" />
        <div className="h-4 w-[28rem] max-w-full animate-pulse rounded-lg bg-muted/70 shimmer" style={{ animationDelay: "80ms" }} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="premium-card h-[128px] animate-pulse rounded-xl shimmer"
            style={{ animationDelay: `${i * 75}ms` }}
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="premium-card h-[320px] animate-pulse rounded-xl shimmer lg:col-span-7" style={{ animationDelay: "300ms" }} />
        <div className="premium-card h-[320px] animate-pulse rounded-xl shimmer lg:col-span-5" style={{ animationDelay: "380ms" }} />
      </div>
      <p className="sr-only">Loading dashboard content — please wait</p>
    </div>
  );
}
