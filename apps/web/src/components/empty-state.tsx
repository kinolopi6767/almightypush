import Link from "next/link";
import type { ReactNode } from "react";

/** Console empty state — dashed panel, single CTA. */
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
 if (process.env.NODE_ENV !== "production" && Boolean(ctaLabel) !== Boolean(ctaHref)) {
  console.warn(`[EmptyState] "${title}": ctaLabel and ctaHref must be provided together.`);
 }
 return (
  <div className="empty">
   {icon && (
    <span aria-hidden className="mx-auto mb-4 flex size-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--panel-2)] text-[var(--ink-2)]">
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      {icon}
     </svg>
    </span>
   )}
   <h2 className="text-[14.5px] font-semibold tracking-tight text-balance">{title}</h2>
   <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[var(--ink-2)] text-pretty">{description}</p>
   {ctaLabel && ctaHref ? (
    <Link href={ctaHref} className="btn btn-primary mt-5">
     {ctaLabel}
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5" aria-hidden><path d="M5 12h14M12 5l6 6-6 6" /></svg>
    </Link>
   ) : null}
  </div>
 );
}
