import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/domains", label: "Domains" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/automations", label: "Automations", disabled: true },
  { href: "/dashboard/settings", label: "Settings", disabled: true },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            P
          </span>
          <span className="font-semibold">PushPanel</span>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map((item) =>
            item.disabled ? (
              <span key={item.href} className="px-3 py-2 text-muted-foreground">
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="mt-auto">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
