import Link from "next/link";
import type { ReactNode } from "react";

const TONES: Record<string, string> = {
  primary: "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)]",
  emerald: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--success)_24%,transparent)]",
  amber: "bg-amber-500/12 text-amber-600 dark:text-amber-400 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warning)_26%,transparent)]",
  sky: "bg-sky-500/12 text-sky-600 dark:text-sky-400 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-sky-500)_24%,transparent)]",
};

/** Stat tile: tinted gradient icon chip, kicker label, big tabular value. */
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
      <div className="flex items-start justify-between gap-2">
        <p className="kicker pt-1 text-muted-foreground">{label}</p>
        {icon && (
          <span aria-hidden className={`flex size-9 items-center justify-center rounded-[10px] ${TONES[tone]}`}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-[18px]"
            >
              {icon}
            </svg>
          </span>
        )}
      </div>
      <p className="tabular mt-3 text-[1.875rem] font-semibold leading-none tracking-tight">{value}</p>
      {hint && <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">{hint}</div>}
    </>
  );

  const cls = `surface card-lift block rounded-xl p-5 ${className}`;
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
