import Link from "next/link";
import type { ReactNode } from "react";

/** Calm empty state — generous whitespace, no harsh dashed border. */
export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center dark:bg-card/30">
      {icon && (
        <span aria-hidden className="mb-4 flex size-12 items-center justify-center rounded-2xl border bg-card text-muted-foreground shadow-xs">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
          >
            {icon}
          </svg>
        </span>
      )}
      <p className="text-[14px] font-semibold tracking-tight">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-5 inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
