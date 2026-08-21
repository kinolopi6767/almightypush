import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { domains } from "@pushpanel/db/schema";
import { automations } from "@pushpanel/db/schema";
import { AUTOMATION_TYPE_LABEL } from "@pushpanel/core";
import { AutomationForm } from "./automation-form";
import { AutomationRow } from "./row-actions";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) redirect("/setup");

  const [rows, domainRows] = await Promise.all([
    db
      .select({
        id: automations.id,
        name: automations.name,
        type: automations.type,
        status: automations.status,
        config_json: automations.config_json,
        last_run_at: automations.last_run_at,
        next_run_at: automations.next_run_at,
        error: automations.error,
        domain_id: automations.domain_id,
        domain_name: domains.name,
      })
      .from(automations)
      .leftJoin(domains, eq(domains.id, automations.domain_id))
      .where(eq(automations.workspace_id, wsId))
      .orderBy(desc(automations.id))
      .all(),
    db
      .select({ id: domains.id, name: domains.name })
      .from(domains)
      .where(eq(domains.workspace_id, wsId))
      .orderBy(domains.name)
      .all(),
  ]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recurring pushes: welcome messages, publish webhooks, AutoMagic posts and YouTube uploads.
          </p>
        </div>
        <AutomationForm domains={domainRows} />
      </div>

      <div className="mt-8 space-y-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm font-medium">No automations yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create one to push automatically — welcome, publish hook, AutoMagic, or drip.</p>
          </div>
        )}
        {rows.map((row) => (
          <div key={row.id} className="card-lift rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {AUTOMATION_TYPE_LABEL[row.type as keyof typeof AUTOMATION_TYPE_LABEL] ?? row.type}
                  </span>
                  <span className="shrink-0 truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground max-w-[140px]">{row.domain_name ?? "—"}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.status === "active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>last {row.last_run_at ? new Date(row.last_run_at).toLocaleString() : "never"}</span>
                  <span>·</span>
                  <span>next {row.next_run_at ? new Date(row.next_run_at).toLocaleString() : "on demand"}</span>
                  {row.error && <span className="break-all text-destructive">· {row.error.slice(0, 120)}</span>}
                </div>
                {row.type === "push_on_publish" && !parseSecret(row.config_json) && (
                  <p className="mt-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                    No webhook secret — recreate it so external publishers can trigger this automation.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                <AutomationRow
                  id={row.id}
                  status={row.status}
                  type={row.type}
                  secret={
                    row.type === "push_on_publish"
                      ? parseSecret(row.config_json)
                      : null
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function parseSecret(configJson: string | null): string {
  try {
    return (JSON.parse(configJson ?? "{}") as { secret?: string }).secret ?? "";
  } catch {
    return "";
  }
}