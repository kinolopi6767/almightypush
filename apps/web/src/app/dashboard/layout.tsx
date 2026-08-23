import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { IosInstallHint } from "@/components/ios-install-hint";
import { AppNav } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";

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
  const role = (session.user.role ?? "owner").toLowerCase();

  return (
    <div className="app-shell flex min-h-svh">
      {/* ── Sidebar ─────────────────────────────── */}
      <aside className="sidebar-panel sticky top-0 hidden h-svh w-[260px] shrink-0 flex-col md:flex">
        {/* Brand */}
        <div className="flex h-[56px] shrink-0 items-center gap-2.5 border-b border-[var(--sidebar-border)] px-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-[13px] font-bold tracking-tight text-background dark:bg-white dark:text-zinc-900">
            P
          </span>
          <div className="leading-none">
            <p className="text-[13.5px] font-semibold tracking-tight text-foreground dark:text-white">PushPanel</p>
            <p className="text-[11px] font-medium text-muted-foreground">Personal · Unlimited</p>
          </div>
          <span className="ml-auto hidden rounded-full border bg-card px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground lg:inline-flex">
            v1
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <AppNav />
        </div>

        {/* User */}
        <div className="border-t border-[var(--sidebar-border)] p-3">
          <div className="flex items-center gap-2.5 rounded-xl border bg-card p-2.5 shadow-xs dark:border-white/5 dark:bg-white/[0.04]">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
            >
              {initials(displayName, email)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium">{displayName}</p>
              <p className="truncate text-[11px] capitalize text-muted-foreground">{role}</p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <SignOutButton
                title="Sign out"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                <span className="sr-only">Sign out</span>
              </SignOutButton>
            </form>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop topbar */}
        <header className="sticky top-0 z-40 hidden h-[56px] items-center justify-between gap-4 border-b bg-card/80 px-6 backdrop-blur-xl md:flex">
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-muted-foreground shadow-xs">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              All systems operational
            </span>
            <span className="hidden text-border-strong lg:inline">·</span>
            <Link href="/dashboard/guides" className="hidden rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:inline-flex">
              Guides
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="mx-1 h-4 w-px bg-border" aria-hidden />
            <Link
              href="/dashboard/campaigns/new"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90 active:scale-[0.98] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden>
                <path d="M5 12h14M12 5v14" />
              </svg>
              New campaign
            </Link>
          </div>
        </header>

        {/* Mobile header */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-card/80 px-4 backdrop-blur-xl md:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-xs font-bold text-background dark:bg-white dark:text-zinc-900">
              P
            </span>
            <span className="text-sm font-semibold tracking-tight">PushPanel</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <SignOutButton className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50" />
            </form>
          </div>
        </header>

        <MobileNav />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>

        <footer className="border-t py-4 text-center text-[11px] tracking-wide text-muted-foreground/60">
          PushPanel · self-hosted · data stays on your server
        </footer>
      </div>
      <IosInstallHint />
    </div>
  );
}

const MOBILE_LINKS = [
  ["/dashboard", "Dashboard"],
  ["/dashboard/domains", "Domains"],
  ["/dashboard/campaigns", "Campaigns"],
  ["/dashboard/analytics", "Analytics"],
  ["/dashboard/segments", "Segments"],
  ["/dashboard/templates", "Templates"],
  ["/dashboard/links", "LP links"],
  ["/dashboard/channels", "Channels"],
  ["/dashboard/automations", "Automations"],
  ["/dashboard/journeys", "Journeys"],
  ["/dashboard/email", "Email"],
  ["/dashboard/ai", "AI Studio"],
  ["/dashboard/status", "Status"],
  ["/dashboard/api", "API"],
  ["/dashboard/guides", "Guides"],
  ["/dashboard/team", "Team"],
  ["/dashboard/settings", "Settings"],
  ["/dashboard/profile", "Profile"],
] as const;

function MobileNav() {
  return (
    <nav className="sticky top-14 z-30 overflow-x-auto border-b bg-card/80 backdrop-blur-xl md:hidden">
      <div className="flex items-center gap-1 px-3 py-2 text-[13px]">
        {MOBILE_LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
