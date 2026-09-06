export default function DashboardLoading() {
  return (
    <div className="enter space-y-6" role="status" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-3">
        <div className="skel h-8 w-56" />
        <div className="skel h-4 w-[28rem] max-w-full opacity-70" style={{ animationDelay: "80ms" }} />
      </div>
      {/* Mirror of page.tsx: KPI row + ops strip + pipeline/live */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skel h-[128px]" style={{ animationDelay: `${(i + 1) * 75}ms` }} />
        ))}
      </div>
      <div className="skel h-[76px]" style={{ animationDelay: "300ms" }} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="skel h-[320px] lg:col-span-3" style={{ animationDelay: "340ms" }} />
        <div className="skel h-[320px] lg:col-span-2" style={{ animationDelay: "400ms" }} />
      </div>
      <p className="sr-only">Loading dashboard content — please wait</p>
    </div>
  );
}
