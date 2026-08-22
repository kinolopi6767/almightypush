import Link from "next/link";
import type { ReactNode } from "react";

/** Stat tile: tinted icon chip, label, big tabular value, optional hint/link. */
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
  /** Inline SVG path data (24×24 stroke). */
  icon?: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "primary" | "emerald" | "amber" | "sky";
  className?: string;
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  };

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="kicker text-muted-foreground">{label}</p>
        {icon && (
          <span aria-hidden className={`flex size-8 items-center justify-center rounded-lg ${tones[tone]}`}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              {icon}
            </svg>
          </span>
        )}
      </div>
      <p className="tabular mt-3 text-[1.75rem] font-semibold leading-none tracking-tight">{value}</p>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </>
  );

  const cls = `card-lift block rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] ${className}`;
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
