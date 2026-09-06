import Link from "next/link";
import type { ReactNode } from "react";

const DOTS: Record<string, string> = {
 brand: "bg-[var(--brand)]",
 ok: "bg-[var(--ok)]",
 warn: "bg-[var(--warn)]",
 info: "bg-[var(--info)]",
};

/** Console KPI — label / tabular value / sub-line. Stripe density, no lift. */
export function StatCard({
 label,
 value,
 icon,
 hint,
 href,
 tone = "brand",
 className = "",
}: {
 label: string;
 value: ReactNode;
 /** Inline SVG <path> children for a 24×24 stroke icon. */
 icon?: ReactNode;
 hint?: ReactNode;
 href?: string;
 tone?: "brand" | "ok" | "warn" | "info";
 className?: string;
}) {
 const body = (
  <>
   <div className="flex items-center justify-between gap-2">
    <p className="kpi-label">{label}</p>
    {icon && (
     <span aria-hidden className="flex size-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--panel-2)] text-[var(--ink-2)]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4">
       {icon}
      </svg>
     </span>
    )}
   </div>
   <p className="kpi-value">{value}</p>
   {hint && <div className="kpi-sub">{hint}</div>}
   <span aria-hidden className={`mt-3 block h-0.5 w-8 rounded-full ${DOTS[tone]}`} />
  </>
 );

 const cls = `kpi ${className}`;
 const testId = `stat-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
 return href ? (
  <Link href={href} className={cls} data-testid={testId} aria-label={`${label}: ${typeof value === "string" ? value : ""}`}>
   {body}
  </Link>
 ) : (
  <div className={cls} data-testid={testId}>
   {body}
  </div>
 );
}
