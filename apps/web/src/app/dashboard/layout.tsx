import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { IosInstallHint } from "@/components/ios-install-hint";
import { AppNav } from "@/components/app-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
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
  // Premium: resolve workspace name for the switcher (fallback to ID)
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
    <div className="app-shell flex min-h-svh">
      {/* Skip link: first focusable element, visible on focus */}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* ── Sidebar — premium chrome that recedes ─────────────── */}
      <aside className="sidebar-panel sticky top-0 z-40 hidden h-svh w-[272px] shrink-0 flex-col pt-[env(safe-area-inset-top)] md:flex">
        {/* Brand — premium */}
        <div className="flex h-[64px] shrink-0 items-center gap-3 px-5">
          <Link href="/dashboard" className="group flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-primary-hover text-[13px] font-bold tracking-tight text-primary-foreground shadow-[0_4px_16px_-4px_color-mix(in_oklab,var(--primary)_55%,transparent),0_1px_3px_oklch(0.22_0.022_267/10%)] ring-1 ring-inset ring-white/10 transition-all duration-200 group-hover:scale-[1.03] group-hover:shadow-[0_6px_20px_-4px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
              </svg>
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-tight text-[var(--sidebar-active-fg)]">PushPanel</span>
              <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">Enterprise</span>
            </span>
          </Link>
          <span className="ml-auto hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold leading-none text-primary ring-1 ring-inset ring-primary/15 lg:inline-flex">
            v1.0
          </span>
        </div>

        {/* Workspace switcher — premium with name */}
        <div className="px-3 pb-2">
          <Link
            href="/dashboard/workspaces"
            aria-label="Switch workspace"
            className="group flex items-center justify-between rounded-xl border bg-card/80 px-3 py-2.5 text-xs backdrop-blur-sm transition-all hover:border-border-strong hover:bg-card hover:shadow-xs"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 font-bold text-primary ring-1 ring-inset ring-primary/15">
                {workspaceName ? workspaceName.slice(0, 2).toUpperCase() : session.user.workspaceId ? `W${String(session.user.workspaceId).slice(-2)}` : "WS"}
              </span>
              <span className="flex min-w-0 flex-col text-left leading-tight">
                <span className="truncate text-[12.5px] font-semibold tracking-tight">{workspaceName ?? `Workspace #${session.user.workspaceId ?? "—"}`}</span>
                <span className="truncate text-[11px] text-muted-foreground">{workspaceName ? `ID ${session.user.workspaceId}` : "Select workspace"}</span>
              </span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-y-px" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <AppNav />
        </div>

        {/* User — premium */}
        <div className="border-t border-[var(--sidebar-border)] p-3">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs transition-all hover:border-border-strong hover:shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-xs font-bold text-primary-foreground shadow-sm ring-1 ring-white/10"
            >
              {initials(displayName, email)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold tracking-tight">{displayName}</p>
              <p className="flex items-center gap-1.5 truncate text-[11px] capitalize text-muted-foreground">
                <span className="size-1.5 rounded-full bg-success" aria-hidden /> {role}
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
                className="inline-flex size-8 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-xs transition-all hover:bg-accent hover:text-accent-foreground hover:border-border-strong disabled:opacity-50"
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

      {/* ── Inset content surface — premium canvas ─────── */}
      <div className="flex min-w-0 flex-1 flex-col md:p-3 md:pl-0">
        <div className="flex min-h-svh flex-1 flex-col bg-card md:min-h-[calc(100svh-1.5rem)] md:rounded-2xl md:border md:shadow-sm">
          {/* Topbar — premium with enhanced blur and hierarchy */}
          <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between gap-4 border-b bg-[var(--header-bg)] px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--header-bg)] md:h-[60px] md:rounded-t-2xl md:px-6 md:pt-0">
            <div className="flex items-center gap-2 text-[13px] md:text-xs">
              {/* Mobile brand */}
              <Link href="/dashboard" className="mr-1 flex items-center gap-2.5 md:hidden">
                <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-xs font-bold text-primary-foreground shadow-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5" aria-hidden><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
                </span>
                <span className="text-sm font-semibold tracking-tight">PushPanel</span>
              </Link>
              <Link
                href="/dashboard/status"
                className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-muted-foreground shadow-xs transition-all hover:border-border-strong hover:text-foreground hover:shadow-sm md:inline-flex"
              >
                <span className="size-2 rounded-full bg-success pulse-dot text-success shadow-[0_0_8px_color-mix(in_oklab,var(--success)_50%,transparent)]" aria-hidden />
                <span className="text-xs font-medium">System operational</span>
              </Link>
              <span className="mx-1 hidden text-border-strong lg:inline">·</span>
              <Link href="/dashboard/guides" className="hidden rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:inline-flex">
                Guides
              </Link>
              <span className="hidden items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground lg:inline-flex">
                <span className="rounded bg-card px-1 py-0.5 text-[10px] font-mono border shadow-xs">⌘</span>K
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <ThemeToggle />
              <div className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
              <Link
                href="/dashboard/campaigns/new"
                className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent),0_1px_3px_oklch(0.22_0.022_267/10%)] transition-all duration-150 hover:bg-primary-hover hover:shadow-[0_4px_16px_-4px_color-mix(in_oklab,var(--primary)_55%,transparent)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden>
                  <path d="M5 12h14M12 5v14" />
                </svg>
                New campaign
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
                className="md:hidden"
              >
                <SignOutButton className="rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50" />
              </form>
            </div>
          </header>

          <MobileNav />

          <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>

          <footer className="mt-auto border-t bg-muted/20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-center text-[11px] tracking-wide text-muted-foreground md:rounded-b-2xl">
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              PushPanel Enterprise · self-hosted · data stays on your server · <Link href="/dashboard/status" className="font-medium text-foreground hover:text-primary transition-colors">System status →</Link>
            </span>
          </footer>
        </div>
      </div>
      <IosInstallHint />
    </div>
  );
}
