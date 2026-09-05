import Link from "next/link";
import type { ReactNode } from "react";

/** Calm empty state — soft glow tile, generous whitespace. */
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
    <div className="premium-card relative flex flex-col items-center justify-center overflow-hidden rounded-2xl px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-60"
        style={{ background: "radial-gradient(28rem 14rem at 50% -20%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -right-12 size-40 rounded-full bg-gradient-to-br from-primary/5 to-transparent blur-2xl"
      />
      {icon && (
        <span aria-hidden className="icon-chip icon-chip-premium relative mb-5 size-14 rounded-2xl shadow-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-7 opacity-80"
          >
            {icon}
          </svg>
        </span>
      )}
      <p className="relative text-[15px] font-semibold tracking-tight text-balance">{title}</p>
      <p className="relative mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground text-pretty">{description}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="relative mt-7 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-[0_4px_16px_-4px_color-mix(in_oklab,var(--primary)_55%,transparent),0_1px_3px_oklch(0.22_0.022_267/10%)] transition-all duration-150 hover:bg-primary-hover hover:shadow-[0_6px_20px_-4px_color-mix(in_oklab,var(--primary)_55%,transparent)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
        >
          {ctaLabel}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5" aria-hidden><path d="M5 12h14M12 5l6 6-6 6" /></svg>
        </Link>
      )}
    </div>
  );
}
