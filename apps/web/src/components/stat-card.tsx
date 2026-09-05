import Link from "next/link";
import type { ReactNode } from "react";

const TONES: Record<string, string> = {
  primary: "bg-primary/[0.08] text-primary ring-1 ring-inset ring-primary/15 dark:bg-primary/15 dark:text-primary dark:ring-primary/20",
  emerald:
    "bg-emerald-500/[0.08] text-emerald-600 ring-1 ring-inset ring-emerald-500/15 dark:bg-emerald-500/15 dark:text-emerald-400",
  amber: "bg-amber-500/[0.08] text-amber-600 ring-1 ring-inset ring-amber-500/15 dark:bg-amber-500/15 dark:text-amber-400",
  sky: "bg-sky-500/[0.08] text-sky-600 ring-1 ring-inset ring-sky-500/15 dark:bg-sky-500/15 dark:text-sky-400",
};

/** Premium KPI tile — editorial, not dashboard. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  href,
  tone = "primary",
  className = "",
}: {
  label: string;
  value: ReactNode;
  /** Inline SVG <path> children for a 24×24 stroke icon. */
  icon?: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "primary" | "emerald" | "amber" | "sky";
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="kicker pt-1.5 text-muted-foreground">{label}</p>
        {icon && (
          <span aria-hidden className={`flex size-9 items-center justify-center rounded-xl shadow-xs transition-colors duration-200 group-hover:scale-[1.02] ${TONES[tone]}`}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-[18px]"
            >
              {icon}
            </svg>
          </span>
        )}
      </div>
      <p className="tabular mt-6 text-[32px] font-semibold leading-none tracking-tight">{value}</p>
      {hint && (
        <div className="mt-4 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">{hint}</div>
      )}
    </>
  );

  const base = "premium-card card-lift group block rounded-xl p-6";
  const cls = `${base} ${className}`;
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
