import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
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
          <Link href="/dashboard" className="rounded-md bg-accent px-3 py-2 text-accent-foreground">
            Dashboard
          </Link>
          <span className="px-3 py-2 text-muted-foreground">Domains</span>
          <span className="px-3 py-2 text-muted-foreground">Campaigns</span>
          <span className="px-3 py-2 text-muted-foreground">Automations</span>
          <span className="px-3 py-2 text-muted-foreground">Settings</span>
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
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {session.user.email} · workspace {session.user.workspaceId ?? "—"} ·{" "}
          {session.user.role}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Subscribers", "0"],
            ["Campaigns sent", "0"],
            ["Open rate", "—"],
            ["Domains", "0"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          M1 comes next — add your first domain and wire the VAPID push loop.
        </div>
      </main>
    </div>
  );
}