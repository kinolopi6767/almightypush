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
      {/* ── Sidebar: always-dark chrome ─────────────────────────── */}
      <aside className="sidebar-panel sticky top-0 hidden h-svh w-[248px] shrink-0 flex-col md:flex">
        <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/55 text-sm font-bold text-primary-foreground shadow-[0_4px_14px_-2px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
            P
          </span>
          <div className="leading-tight">
            <p className="text-[13.5px] font-semibold tracking-tight">PushPanel</p>
            <p className="text-[10.5px] font-medium text-[var(--sidebar-fg-muted)]">Personal · Unlimited</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 pb-4">
          <AppNav />
        </div>

        {/* User card */}
        <div className="mx-2.5 mb-3 rounded-xl border border-[var(--sidebar-border)] bg-black/20 p-2.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary/40 text-[11px] font-bold text-primary-foreground"
            >
              {initials(displayName, email)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium">{displayName}</p>
              <p className="truncate text-[10.5px] capitalize text-[var(--sidebar-fg-muted)]">{role}</p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <SignOutButton
                title="Sign out"
                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--sidebar-fg-muted)] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
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

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop topbar */}
        <header className="sticky top-0 z-40 hidden items-center justify-between gap-3 border-b border-border/70 bg-[var(--header-bg)] px-6 py-2.5 backdrop-blur-md md:flex">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/dashboard/status" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              <span aria-hidden className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-success" />
              </span>
              System status
            </Link>
            <span aria-hidden className="text-border-strong">·</span>
            <Link href="/dashboard/guides" className="transition-colors hover:text-foreground">
              Guides
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/dashboard/campaigns/new"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-[0_2px_10px_-2px_color-mix(in_oklab,var(--primary)_50%,transparent)] transition-all hover:bg-primary-hover active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden>
                <path d="M5 12h14M12 5v14" />
              </svg>
              New campaign
            </Link>
          </div>
        </header>

        {/* Mobile header */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border/70 bg-[var(--header-bg)] px-4 py-2.5 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/55 text-xs font-bold text-primary-foreground">
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
              <SignOutButton className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50" />
            </form>
          </div>
        </header>

        {/* Mobile chip nav */}
        <MobileNav />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 md:px-8 md:py-9">{children}</main>

        <footer className="border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground/70">
          PushPanel · self-hosted web push · data stays on your server
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
    <nav className="sticky top-[49px] z-30 overflow-x-auto border-b border-border/70 bg-[var(--header-bg)] px-3 py-2 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-1 text-[13px]">
        {MOBILE_LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
