export default function DashboardLoading() {
  return (
    <div className="rise space-y-6" role="status" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-3">
        <div className="h-8 w-56 rounded-xl bg-muted shimmer" />
        <div className="h-4 w-[28rem] max-w-full rounded-lg bg-muted/70 shimmer" style={{ animationDelay: "80ms" }} />
      </div>
      {/* Mirror of page.tsx hero: 5-col hero + 7-col (3 stat cards + infra strip) */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rounded-2xl shimmer lg:col-span-5" style={{ minHeight: 280 }} />
        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-7">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[128px] rounded-xl shimmer" style={{ animationDelay: `${(i + 1) * 75}ms` }} />
          ))}
          <div className="h-[76px] rounded-xl shimmer sm:col-span-3" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="h-[320px] rounded-xl shimmer lg:col-span-7" style={{ animationDelay: "340ms" }} />
        <div className="h-[320px] rounded-xl shimmer lg:col-span-5" style={{ animationDelay: "400ms" }} />
      </div>
      <p className="sr-only">Loading dashboard content — please wait</p>
    </div>
  );
}
