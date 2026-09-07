import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { IosInstallHint } from "@/components/ios-install-hint";
import { AppNav } from "@/components/app-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { RailToggle } from "@/components/rail-toggle";
import { ConsoleBreadcrumb } from "@/components/console-breadcrumb";
import { HealthBadge } from "@/components/health-badge";
import { db } from "@/lib/db";
import { workspaces } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";

function initials(name: string | null | undefined, email: string): string {
 const source = (name ?? email).trim();
 const parts = source.split(/[\s@.]+/).filter(Boolean);
 return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
 const session = await auth();
 if (!session?.user) redirect("/login");

 const displayName = session.user.name ?? session.user.email ?? "Account";
 const email = session.user.email ?? "";
 const role = (session.user.role ?? "viewer").toLowerCase();
 let workspaceName: string | null = null;
 if (session.user.workspaceId) {
  try {
   const [ws] = db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, Number(session.user.workspaceId)))
    .limit(1)
    .all();
   workspaceName = ws?.name ?? null;
  } catch {
   workspaceName = null;
  }
 }

 return (
  <div className="console-shell flex min-h-svh">
   <a
    href="#main-content"
    className="sr-only z-50 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-ink)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
   >
    Skip to content
   </a>

   {/* ── Dark forest rail ─────────────────────────── */}
   <aside data-rail data-collapsed="false" className="console-rail sticky top-0 z-40 hidden h-svh shrink-0 flex-col md:flex">
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--rail-line)] px-4">
     <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand)] text-[var(--brand-ink)]" aria-hidden>
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
       </svg>
      </span>
      <span className="rail-label flex min-w-0 flex-col leading-none">
       <span className="truncate text-[14px] font-semibold tracking-tight text-white">PushPanel</span>
       <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--rail-muted)]">Console</span>
      </span>
     </Link>
     <span className="rail-extra shrink-0">
      <RailToggle />
     </span>
    </div>

    <div className="border-b border-[var(--rail-line)] px-3 py-3">
     <Link
      href="/dashboard/workspaces"
      aria-label="Switch workspace"
      className="rail-label flex items-center justify-between gap-2 rounded-md border border-[var(--rail-line)] bg-[var(--rail-2)] px-2.5 py-2 transition-colors hover:border-white/20"
     >
      <span className="flex min-w-0 items-center gap-2">
       <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--brand)] text-[11px] font-bold text-[var(--brand-ink)]" aria-hidden>
        {workspaceName ? workspaceName.slice(0, 2).toUpperCase() : "WS"}
       </span>
       <span className="flex min-w-0 flex-col text-left leading-tight">
        <span className="truncate text-[12.5px] font-semibold text-white">{workspaceName ?? `Workspace #${session.user.workspaceId ?? "—"}`}</span>
        <span className="truncate font-mono text-[10.5px] text-[var(--rail-muted)]">id {session.user.workspaceId ?? "—"}</span>
       </span>
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0 text-[var(--rail-muted)]" aria-hidden>
       <path d="m6 9 6 6 6-6" />
      </svg>
     </Link>
    </div>

    <div className="flex-1 overflow-y-auto px-2.5 py-3">
     <AppNav />
    </div>

    <div className="border-t border-[var(--rail-line)] p-3">
     <div className="flex items-center gap-2.5 rounded-md border border-[var(--rail-line)] bg-[var(--rail-2)] p-2.5">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white">
       {initials(displayName, email)}
      </span>
      <div className="rail-label min-w-0 flex-1 leading-tight">
       <p className="truncate text-[12.5px] font-semibold text-white">{displayName}</p>
       <p className="flex items-center gap-1.5 truncate text-[11px] capitalize text-[var(--rail-muted)]">
        <span className="livedot" aria-hidden /> {role}
       </p>
      </div>
      <form
       action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
       }}
      >
       <SignOutButton
        title="Sign out"
        aria-label="Sign out"
        className="inline-flex size-8 items-center justify-center rounded-md text-[var(--rail-muted)] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
       >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
         <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        <span className="sr-only">Sign out</span>
       </SignOutButton>
      </form>
     </div>
    </div>
   </aside>

   {/* ── Content column ───────────────────────────── */}
   <div className="flex min-w-0 flex-1 flex-col">
    <header className="console-topbar sticky top-0 z-30 flex h-14 items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 md:hidden" aria-label="PushPanel home">
              <span className="flex size-7 items-center justify-center rounded-md bg-[var(--brand)] text-[var(--brand-ink)]" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="size-3.5" aria-hidden><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
              </span>
            </Link>
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <ConsoleBreadcrumb workspaceName={workspaceName} />
              <HealthBadge />
            </div>
          </div>
     <div className="flex shrink-0 items-center gap-2">
      <Link href="/dashboard/guides" className="btn btn-ghost btn-sm hidden lg:inline-flex">
       Guides
      </Link>
      <ThemeToggle />
      <Link href="/dashboard/campaigns/new" className="btn btn-primary btn-sm">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-3.5" aria-hidden>
        <path d="M5 12h14M12 5v14" />
       </svg>
       New send
      </Link>
      <form
       action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
       }}
       className="md:hidden"
      >
       <SignOutButton className="btn btn-ghost btn-sm" />
      </form>
     </div>
    </header>

    <MobileNav />

    <main id="main-content" className="console-content flex-1">{children}</main>

    <footer className="border-t px-6 py-3.5 text-[12px] text-[var(--ink-3)]">
     <span className="mx-auto flex w-full max-w-[76rem] items-center gap-2">
      <span className="livedot" aria-hidden />
      PushPanel Console · self-hosted · data stays on your server ·
      <Link href="/dashboard/status" className="font-medium text-[var(--ink-2)] underline underline-offset-4 hover:text-[var(--ink)]">
       System status
      </Link>
     </span>
    </footer>
   </div>
   <IosInstallHint />
  </div>
 );
}
