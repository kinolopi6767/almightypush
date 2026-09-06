import type { ReactNode } from "react";
import Link from "next/link";

/** Shared auth chrome: forest rail + centred form column. */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-rail">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-[var(--brand)] text-[var(--brand-ink)]" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">PushPanel</span>
          <span className="badge ml-1 border-white/15 bg-white/10 text-white">Console</span>
        </div>
        <div className="mt-auto space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--rail-muted)]">Self-hosted web push</p>
          <p className="text-balance text-[22px] font-semibold leading-snug tracking-tight text-white">
            One panel. Every domain. Zero vendors.
          </p>
          <ul className="space-y-2 text-[13px] text-[var(--rail-muted)]">
            <li className="flex items-center gap-2"><span className="livedot" aria-hidden /> Unlimited domains &amp; subscribers</li>
            <li className="flex items-center gap-2"><span className="livedot" aria-hidden /> VAPID delivery, worker-queued</li>
            <li className="flex items-center gap-2"><span className="livedot" aria-hidden /> Data stays on your server</li>
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-5">
          <div className="space-y-1.5">
            <p className="page-eyebrow">PushPanel Console</p>
            <h1 className="page-title">{title}</h1>
            <p className="page-desc">{description}</p>
          </div>
          {children}
          <p className="text-center text-xs text-[var(--ink-3)]">
            Self-hosted web push ·{" "}
            <Link href="/api/health" className="underline underline-offset-4 hover:text-[var(--ink)]">
              health
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
