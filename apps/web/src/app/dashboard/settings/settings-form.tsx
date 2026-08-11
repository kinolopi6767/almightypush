"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBackupAction, deleteBackupAction, updateSettingsAction, type SettingsFormState } from "./actions";

function Status({ state }: { state: SettingsFormState }) {
  if (!state) return null;
  if (state.error) {
    return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>;
  }
  if (state.backupId !== undefined) {
    return (
      <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        Backup created (#{state.backupId}).
      </p>
    );
  }
  if (state.ok) return <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>;
  return null;
}

export function SettingsForm({
  timezone,
  retentionDays,
  sendingSpeed,
  utmEnabled,
  backupInterval,
  backupRetention,
}: {
  timezone: string;
  retentionDays: string;
  sendingSpeed: string;
  utmEnabled: boolean;
  backupInterval: string;
  backupRetention: string;
}) {
  const [state, action, pending] = useActionState(
    (_prev: SettingsFormState, formData: FormData) => updateSettingsAction(_prev, formData),
    undefined,
  );

  return (
    <form action={action} className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">General</h2>

      <div className="space-y-1">
        <label htmlFor="timezone" className="text-sm font-medium">
          Timezone
        </label>
        <input
          id="timezone"
          name="timezone"
          defaultValue={timezone}
          placeholder="UTC (e.g. America/New_York)"
          className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">Display timezone for the dashboard.</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="cleanupRetentionDays" className="text-sm font-medium">
          Unsubscribed retention (days)
        </label>
        <input
          id="cleanupRetentionDays"
          name="cleanupRetentionDays"
          type="number"
          min={0}
          max={3650}
          defaultValue={retentionDays}
          className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Purge unsubscribed subscribers older than this. The worker cleanup job reads this value; 0 disables it.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="sendingSpeed" className="text-sm font-medium">
          Sending speed (concurrent deliveries)
        </label>
        <input
          id="sendingSpeed"
          name="sendingSpeed"
          type="number"
          min={1}
          max={200}
          defaultValue={sendingSpeed}
          className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          How many pushes the worker has in flight per cycle. Lower it to be gentler to the push service; raise it to
          drain queues faster.
        </p>
      </div>

      <div className="space-y-1">
        <span className="text-sm font-medium">Campaign tracking (UTM)</span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="utmEnabled" value="on" defaultChecked={utmEnabled} className="h-4 w-4" />
          Append <code className="rounded bg-muted px-1">utm_source=pushpanel&amp;utm_medium=push&amp;utm_campaign=…</code> to
          click URLs
        </label>
        <p className="text-xs text-muted-foreground">Applied to the notification click URL and each action button at send time.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="backupInterval" className="text-sm font-medium">
            Automatic backup
          </label>
          <select
            id="backupInterval"
            name="backupInterval"
            defaultValue={backupInterval}
            className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <p className="text-xs text-muted-foreground">The worker snapshots the database on this schedule.</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="backupRetention" className="text-sm font-medium">
            Keep (snapshots)
          </label>
          <input
            id="backupRetention"
            name="backupRetention"
            type="number"
            min={1}
            max={60}
            defaultValue={backupRetention}
            className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm"
          />
          <p className="text-xs text-muted-foreground">Newest N automated snapshots kept; older ones are pruned.</p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
      <Status state={state} />
    </form>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupsPanel({ rows }: { rows: { id: number; kind: string; status: string; size_bytes: number; created_at: string }[] }) {
  const router = useRouter();
  const [createState, createAction, creating] = useActionState(
    () => createBackupAction(),
    undefined,
  );

  useEffect(() => {
    if (createState?.backupId !== undefined) router.refresh();
  }, [createState, router]);

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Backups</h2>
        <button
          onClick={() => void createAction()}
          disabled={creating}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create backup"}
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        A VACUUM INTO snapshot of the database, saved to <code className="rounded bg-muted px-1">data/backups/</code>.
      </p>
      <Status state={createState} />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No backups yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{b.kind}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        b.status === "done"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{formatBytes(b.size_bytes)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/api/backups/${b.id}/download`}
                        className="rounded-md px-2 py-1 text-sm text-primary hover:underline"
                      >
                        Download
                      </Link>
                      <DeleteBackup id={b.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeleteBackup({ id }: { id: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(() => deleteBackupAction(id), undefined);

  useEffect(() => {
    if (state?.deleted !== undefined) router.refresh();
  }, [state, router]);

  return (
    <button
      onClick={() => {
        if (window.confirm("Delete this backup?")) void action();
      }}
      disabled={pending}
      className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
