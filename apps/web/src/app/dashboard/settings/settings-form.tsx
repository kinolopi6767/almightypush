"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBackupAction, deleteBackupAction, restoreBackupAction, updateGDriveAction, updateOutboundAction, updateSecretsAction, updateSettingsAction, type SettingsFormState } from "./actions";

function TestConnectionButton({ provider, label }: { provider: "ai" | "you" | "mail" | "drive"; label: string }) {
  const [state, setState] = useState<{ ok?: boolean; msg?: string; loading?: boolean } | null>(null);
  const test = async () => {
    setState({ loading: true });
    try {
      const res = await fetch("/api/v1/test-connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string; error?: string };
      setState({ ok: data.ok, msg: data.ok ? data.message : data.error, loading: false });
    } catch (e) {
      setState({ ok: false, msg: e instanceof Error ? e.message : "Failed", loading: false });
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={test}
        disabled={state?.loading}
        className="inline-flex h-7 items-center rounded-md border bg-card px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
      >
        {state?.loading ? "Testing…" : label}
      </button>
      {state && !state.loading && (
        <span className={`text-xs ${state.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{state.msg}</span>
      )}
    </span>
  );
}

function Status({ state }: { state: SettingsFormState }) {
  if (!state) return null;
  if (state.error) {
    return <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>;
  }
  if (state.backupId !== undefined) {
    return (
      <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        Backup created (#{state.backupId}).
      </p>
    );
  }
  if (state.ok) return <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>;
  return null;
}

export function SettingsForm({
  timezone,
  retentionDays,
  sendingSpeed,
  utmEnabled,
  apiAccess,
  backupInterval,
  backupRetention,
  whiteLabel,
  cdnUrl,
  frequencyCapDaily,
  suppressionEnabled,
}: {
  timezone: string;
  retentionDays: string;
  sendingSpeed: string;
  utmEnabled: boolean;
  apiAccess: boolean;
  backupInterval: string;
  backupRetention: string;
  whiteLabel: boolean;
  cdnUrl: string;
  frequencyCapDaily: string;
  suppressionEnabled: boolean;
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
          className="h-9 w-full max-w-xs rounded-md border bg-card px-3 text-sm"
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
          max={36500}
          defaultValue={retentionDays}
          className="h-9 w-full max-w-xs rounded-md border bg-card px-3 text-sm"
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
          max={1000}
          defaultValue={sendingSpeed}
          className="h-9 w-full max-w-xs rounded-md border bg-card px-3 text-sm"
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

      <div className="space-y-1">
        <span className="text-sm font-medium">REST API access</span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="apiAccess" value="on" defaultChecked={apiAccess} className="h-4 w-4" />
          Allow key-authenticated requests to <code className="rounded bg-muted px-1">/api/v1/*</code>
        </label>
        <p className="text-xs text-muted-foreground">Keys stay in the API page but stop working while this is off.</p>
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
            className="h-9 w-full max-w-xs rounded-md border bg-card px-3 text-sm"
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
            max={365}
            defaultValue={backupRetention}
            className="h-9 w-full max-w-xs rounded-md border bg-card px-3 text-sm"
          />
          <p className="text-xs text-muted-foreground">Newest N automated snapshots kept; older ones are pruned.</p>
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-sm font-medium">White-label (Business)</span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="whiteLabel" value="on" defaultChecked={whiteLabel} className="h-4 w-4" />
          Remove “Powered by PushPanel” branding from prompts and emails
        </label>
      </div>

      <div className="space-y-1">
        <label htmlFor="cdnUrl" className="text-sm font-medium">
          Global Edge CDN URL
        </label>
        <input
          id="cdnUrl"
          name="cdnUrl"
          defaultValue={cdnUrl}
          placeholder="https://cdn.example.com"
          className="h-9 w-full max-w-xs rounded-md border bg-card px-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">Dedicated Enterprise CDN for SDK delivery (empty = self-host).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="frequencyCapDaily" className="text-sm font-medium">
            Fatigue Shield — daily cap per subscriber
          </label>
          <input
            id="frequencyCapDaily"
            name="frequencyCapDaily"
            type="number"
            min={0}
            max={1000}
            defaultValue={frequencyCapDaily}
            className="h-9 w-full max-w-xs rounded-md border bg-card px-3 text-sm"
          />
          <p className="text-xs text-muted-foreground">0 = off. Enforced as a calendar-day cap AND a rolling 24h window (whichever bites). Over cap = suppressed, not sent.</p>
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">Suppression & Spam Protection</span>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="suppressionEnabled" value="on" defaultChecked={suppressionEnabled} className="h-4 w-4" />
            Auto-suppress bounced email contacts (status=bounced)
          </label>
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
        {/* VACUUM INTO can take >5s on busy disks — the assertion in the e2e
           test also uses a generous timeout. No change needed here. */}
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
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[560px] text-sm">
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
                      <RestoreBackup id={b.id} />
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

function RestoreBackup({ id }: { id: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(() => restoreBackupAction(id), undefined);

  useEffect(() => {
    if (state?.ok || state?.error) router.refresh();
  }, [state, router]);

  return (
    <span className="inline-flex items-center gap-2">
      {state?.ok && (
        <span role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
          Restored — restart recommended.
        </span>
      )}
      {state?.error && (
        <span role="alert" className="text-xs text-destructive">{state.error}</span>
      )}
      <button
        onClick={() => {
          if (window.confirm("Restore this backup? Current data will be overwritten. Continue?")) void action();
        }}
        disabled={pending}
        aria-busy={pending}
        className="rounded-md px-2 py-1 text-sm text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 disabled:opacity-50 dark:text-amber-400 dark:hover:text-amber-300"
      >
        {pending ? "Restoring…" : "Restore"}
      </button>
    </span>
  );
}

export function SecretsForm({
  hasAiKey,
  aiModel,
  aiBaseUrl,
  mailProvider,
  hasMailKey,
  mailFrom,
}: {
  hasAiKey: boolean;
  aiModel: string;
  aiBaseUrl: string;
  mailProvider: string;
  hasMailKey: boolean;
  mailFrom: string;
}) {
  const [state, action, pending] = useActionState(updateSecretsAction, undefined);
  return (
    <form action={action} className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">API Keys — managed in panel (no .env hassle)</h2>
      <p className="text-sm text-muted-foreground">
        All keys stored encrypted (AES-256-GCM via <code className="rounded bg-muted px-1">APP_ENC_KEY</code>) in the panel DB. Leave blank to keep existing. Env vars remain fallback.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="ai_api_key" className="text-sm font-medium">
            AI API Key (OpenAI / Anthropic)
          </label>
          <input
            id="ai_api_key"
            name="ai_api_key"
            type="password"
            placeholder={hasAiKey ? "•••••••• (set) — leave blank to keep" : "sk-..."}
            className="h-9 w-full rounded-md border bg-card px-3 text-sm"
          />
          <p className="text-xs text-muted-foreground">Powers AI Studio: hook angles, spam score, translate, URL→campaign, image.</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="ai_model" className="text-sm font-medium">
            AI Model
          </label>
          <input id="ai_model" name="ai_model" defaultValue={aiModel} placeholder="gpt-4o-mini" className="h-9 w-full rounded-md border bg-card px-3 text-sm" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="ai_base_url" className="text-sm font-medium">
            AI Base URL
          </label>
          <input
            id="ai_base_url"
            name="ai_base_url"
            defaultValue={aiBaseUrl}
            placeholder="https://api.openai.com/v1"
            className="h-9 w-full rounded-md border bg-card px-3 text-sm"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="ydc_api_key" className="text-sm font-medium">
            You.com API Key <span className="font-normal text-muted-foreground">(optional — web grounding)</span>
          </label>
          <input
            id="ydc_api_key"
            name="ydc_api_key"
            type="password"
            placeholder="ydc_... — leave blank to keep · free tier works without key"
            className="h-9 w-full rounded-md border bg-card px-3 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Powers URL→Campaign enrichment + hook research via you.com Search. Get free 200 credits at you.com. Leave blank to use heuristic fallback.
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor="mail_provider" className="text-sm font-medium">
            Mail Provider
          </label>
          <select id="mail_provider" name="mail_provider" defaultValue={mailProvider} className="h-9 w-full rounded-md border bg-card px-3 text-sm">
            <option value="">— none —</option>
            <option value="resend">Resend</option>
            <option value="brevo">Brevo</option>
            <option value="ses">AWS SES</option>
            <option value="smtp">SMTP</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="mail_api_key" className="text-sm font-medium">
            Mail API Key
          </label>
          <input
            id="mail_api_key"
            name="mail_api_key"
            type="password"
            placeholder={hasMailKey ? "•••••••• (set)" : "re_... / xkeysib-..."}
            className="h-9 w-full rounded-md border bg-card px-3 text-sm"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="mail_from" className="text-sm font-medium">
            Mail From (verified domain)
          </label>
          <input id="mail_from" name="mail_from" type="email" defaultValue={mailFrom} placeholder="news@yourdomain.com" className="h-9 w-full rounded-md border bg-card px-3 text-sm" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Saving…" : "Save API Keys"}
        </button>
        <TestConnectionButton provider="ai" label="Test AI" />
        <TestConnectionButton provider="you" label="Test You.com" />
        <TestConnectionButton provider="mail" label="Test Mail" />
      </div>
      <Status state={state} />
    </form>
  );
}

export function GDriveForm({ enabled, folderId, hasServiceJson }: { enabled: boolean; folderId: string; hasServiceJson: boolean }) {
  const [state, action, pending] = useActionState(updateGDriveAction, undefined);
  return (
    <form action={action} className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">Google Drive Auto-Backup</h2>
      <p className="text-sm text-muted-foreground">
        Disabled by default. Enable to auto-upload every <code className="rounded bg-muted px-1">VACUUM INTO</code> snapshot to Drive. For personal single-tenant, share a Drive folder with your Service Account email.
      </p>
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="gdrive_enabled" value="on" defaultChecked={enabled} className="h-4 w-4" />
          Enable Google Drive upload after each backup (manual + auto)
        </label>
      </div>
      <div className="space-y-1">
        <label htmlFor="gdrive_folder_id" className="text-sm font-medium">
          Drive Folder ID (optional)
        </label>
        <input id="gdrive_folder_id" name="gdrive_folder_id" defaultValue={folderId} placeholder="1aB2cDeFgHiJkL — leave empty for My Drive root" className="h-9 w-full rounded-md border bg-card px-3 text-sm" />
        <p className="text-xs text-muted-foreground">Find in Drive URL: https://drive.google.com/drive/folders/{"<ID>"}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="gdrive_service_json" className="text-sm font-medium">
          Service Account JSON {hasServiceJson ? "(already set — paste to replace)" : ""}
        </label>
        <textarea
          id="gdrive_service_json"
          name="gdrive_service_json"
          rows={4}
          placeholder='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----...","client_email":"...@...iam.gserviceaccount.com"}'
          className="w-full rounded-md border bg-card px-3 py-2 font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">Stored encrypted. Share your Drive folder with the service account email (Viewer or Editor).</p>
      </div>
      <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How to get JSON:</p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>GCP Console → IAM → Service Accounts → Create → Enable Drive API</li>
          <li>Keys → Add Key → JSON → download</li>
          <li>Drive → New Folder → Share → paste service account email</li>
          <li>Paste JSON above → Save → Test with “Create backup” → check Drive</li>
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Saving…" : "Save Drive Settings"}
        </button>
        <TestConnectionButton provider="drive" label="Test Drive" />
      </div>
      <Status state={state} />
    </form>
  );
}


export function OutboundWebhookForm({ url, hasSecret }: { url: string; hasSecret: boolean }) {
  const [state, action, pending] = useActionState(updateOutboundAction, undefined);
  return (
    <form action={action} className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">Outbound event webhooks</h2>
      <p className="text-sm text-muted-foreground">
        POSTs HMAC-signed JSON to your endpoint on{" "}
        <code className="rounded bg-muted px-1">subscribed</code>,{" "}
        <code className="rounded bg-muted px-1">unsubscribed</code>,{" "}
        <code className="rounded bg-muted px-1">clicked</code> and{" "}
        <code className="rounded bg-muted px-1">campaign_done</code> events — plug straight into n8n, Zapier or
        your own backend. Clear the URL to disable.
      </p>
      <div className="space-y-1">
        <label htmlFor="outbound_webhook_url" className="text-sm font-medium">
          Webhook URL {url ? "(active)" : ""}
        </label>
        <input
          id="outbound_webhook_url"
          name="outbound_webhook_url"
          type="url"
          defaultValue={url}
          placeholder="https://n8n.example.com/webhook/pushpanel"
          className="h-9 w-full rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="outbound_webhook_secret" className="text-sm font-medium">
          Signing secret {hasSecret ? "(set — leave blank to keep)" : "(optional but recommended)"}
        </label>
        <input
          id="outbound_webhook_secret"
          name="outbound_webhook_secret"
          type="password"
          autoComplete="off"
          placeholder={hasSecret ? "••••••••" : "whsec_..."}
          className="h-9 w-full rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Verify header <code className="rounded bg-muted px-1">X-PushPanel-Signature</code> as{" "}
          <code className="rounded bg-muted px-1">sha256=HMAC(secret, timestamp + &quot;.&quot; + body)</code>.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save webhooks"}
      </button>
      <Status state={state} />
    </form>
  );
}
