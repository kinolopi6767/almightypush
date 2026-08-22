export default function DashboardLoading() {
  return (
    <div>
      <div className="h-7 w-44 animate-pulse rounded-md bg-muted" />
      <div className="mt-2.5 h-4 w-80 max-w-full animate-pulse rounded bg-muted/70" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[104px] animate-pulse rounded-xl border bg-card shadow-[var(--shadow-card)]"
            style={{ animationDelay: `${i * 75}ms` }}
          />
        ))}
      </div>
      <div className="mt-6 h-72 animate-pulse rounded-xl border bg-card shadow-[var(--shadow-card)]" />
    </div>
  );
}
