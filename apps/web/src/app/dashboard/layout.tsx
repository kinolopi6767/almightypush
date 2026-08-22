import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { IosInstallHint } from "@/components/ios-install-hint";
import { AppNav } from "@/components/app-nav";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="app-shell flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-card/60 px-3 py-5 backdrop-blur md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25">
            P
          </span>
          <span className="text-[15px] font-semibold tracking-tight">PushPanel</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AppNav />
        </div>
        <div className="mt-4 border-t pt-4">
          <div className="px-2 pb-2">
            <p className="truncate text-xs font-medium">{session.user.name ?? session.user.email}</p>
            <p className="truncate text-[11px] text-muted-foreground">{session.user.role}</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <SignOutButton className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50" />
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-xs font-bold text-primary-foreground">
              P
            </span>
            <span className="text-sm font-semibold tracking-tight">PushPanel</span>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <SignOutButton className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50" />
          </form>
        </header>
        <nav className="sticky top-[49px] z-30 overflow-x-auto border-b bg-background/80 px-3 py-2 backdrop-blur md:hidden">
          <div className="flex items-center gap-1 text-sm">
            <Link
              href="/dashboard"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/domains"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Domains
            </Link>
            <Link
              href="/dashboard/campaigns"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Campaigns
            </Link>
            <Link
              href="/dashboard/analytics"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Analytics
            </Link>
            <Link
              href="/dashboard/segments"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Segments
            </Link>
            <Link
              href="/dashboard/templates"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Templates
            </Link>
            <Link
              href="/dashboard/links"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              LP links
            </Link>
            <Link
              href="/dashboard/channels"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              YouTube channels
            </Link>
            <Link
              href="/dashboard/automations"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Automations
            </Link>
            <Link
              href="/dashboard/journeys"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Journeys
            </Link>
            <Link
              href="/dashboard/email"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Email
            </Link>
            <Link
              href="/dashboard/ai"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              AI Studio
            </Link>
            <Link
              href="/dashboard/status"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Status
            </Link>
            <Link
              href="/dashboard/api"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              API
            </Link>
            <Link
              href="/dashboard/guides"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Guides
            </Link>
            <Link
              href="/dashboard/team"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Team
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Settings
            </Link>
            <Link
              href="/dashboard/profile"
              className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent"
            >
              Profile
            </Link>
          </div>
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
      <IosInstallHint />
    </div>
  );
}
