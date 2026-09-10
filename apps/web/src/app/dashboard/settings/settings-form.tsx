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
     className="btn btn-secondary btn-sm"
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
  return <p role="alert" className="form-alert">{state.error}</p>;
 }
 if (state.backupId !== undefined) {
  return (
   <p role="status" className="form-ok">
    Backup created (#{state.backupId}).
   </p>
  );
 }
 if (state.ok) return <p role="status" className="form-ok">Saved.</p>;
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
   <form action={action} className="panel">
    <div className="panel-head">
     <div>
      <h2 className="panel-title">General</h2>
      <p className="panel-desc">Timezone, retention, delivery speed and panel-wide toggles.</p>
     </div>
    </div>
    <div className="panel-body">

    <div className="field">
     <label htmlFor="timezone" className="label">
      Timezone
     </label>
     <input
      id="timezone"
      name="timezone"
      defaultValue={timezone}
      placeholder="UTC (e.g. America/New_York)"
      className="input"
     />
     <p className="hint">Display timezone for the dashboard.</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
    <div className="field">
     <label htmlFor="cleanupRetentionDays" className="label">
      Unsubscribed retention (days)
     </label>
     <input
      id="cleanupRetentionDays"
      name="cleanupRetentionDays"
      type="number"
      min={0}
      max={36500}
      defaultValue={retentionDays}
      className="input"
     />
     <p className="hint">
      Purge unsubscribed subscribers older than this. The worker cleanup job reads this value; 0 disables it.
     </p>
    </div>

    <div className="field">
     <label htmlFor="sendingSpeed" className="label">
      Sending speed (concurrent deliveries)
     </label>
     <input
      id="sendingSpeed"
      name="sendingSpeed"
      type="number"
      min={1}
      max={1000}
      defaultValue={sendingSpeed}
      className="input"
     />
     <p className="hint">
      How many pushes the worker has in flight per cycle. Lower it to be gentler to the push service; raise it to
      drain queues faster.
     </p>
    </div>
    </div>

    <label className="check-card">
     <input type="checkbox" name="utmEnabled" value="on" defaultChecked={utmEnabled} />
     <span>
      <span className="check-title">Campaign tracking (UTM)</span>
      <span className="check-desc">Append <code className="rounded bg-muted px-1">utm_source=pushpanel&amp;utm_medium=push&amp;utm_campaign=…</code> to click URLs and action buttons at send time.</span>
     </span>
    </label>

    <label className="check-card">
     <input type="checkbox" name="apiAccess" value="on" defaultChecked={apiAccess} />
     <span>
      <span className="check-title">REST API access</span>
      <span className="check-desc">Allow key-authenticated requests to <code className="rounded bg-muted px-1">/api/v1/*</code>. Keys stay in the API page but stop working while this is off.</span>
     </span>
    </label>

    <div className="grid gap-4 sm:grid-cols-2">
     <div className="field">
      <label htmlFor="backupInterval" className="label">
       Automatic backup
      </label>
      <select
       id="backupInterval"
       name="backupInterval"
       defaultValue={backupInterval}
       className="select"
      >
       <option value="off">Off</option>
       <option value="daily">Daily</option>
       <option value="weekly">Weekly</option>
       <option value="monthly">Monthly</option>
      </select>
      <p className="hint">The worker snapshots the database on this schedule.</p>
     </div>
     <div className="field">
      <label htmlFor="backupRetention" className="label">
       Keep (snapshots)
      </label>
      <input
       id="backupRetention"
       name="backupRetention"
       type="number"
       min={1}
       max={365}
       defaultValue={backupRetention}
       className="input"
      />
      <p className="hint">Newest N automated snapshots kept; older ones are pruned.</p>
     </div>
    </div>

    <label className="check-card">
     <input type="checkbox" name="whiteLabel" value="on" defaultChecked={whiteLabel} />
     <span>
      <span className="check-title">White-label (Business)</span>
      <span className="check-desc">Remove “Powered by PushPanel” branding from prompts and emails.</span>
     </span>
    </label>

    <div className="field">
     <label htmlFor="cdnUrl" className="label">
      Global Edge CDN URL
     </label>
     <input
      id="cdnUrl"
      name="cdnUrl"
      defaultValue={cdnUrl}
      placeholder="https://cdn.example.com"
      className="input"
     />
     <p className="hint">Dedicated Enterprise CDN for SDK delivery (empty = self-host).</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
     <div className="field">
      <label htmlFor="frequencyCapDaily" className="label">
       Fatigue Shield — daily cap per subscriber
      </label>
      <input
       id="frequencyCapDaily"
       name="frequencyCapDaily"
       type="number"
       min={0}
       max={1000}
       defaultValue={frequencyCapDaily}
       className="input"
      />
      <p className="hint">0 = off. Enforced as a calendar-day cap AND a rolling 24h window (whichever bites). Over cap = suppressed, not sent.</p>
     </div>
     <div className="field">
      <span className="label">Suppression &amp; Spam Protection</span>
      <label className="check-card">
       <input type="checkbox" name="suppressionEnabled" value="on" defaultChecked={suppressionEnabled} />
       <span>
        <span className="check-title">Auto-suppress bounced contacts</span>
        <span className="check-desc">Skip email contacts with status=bounced.</span>
       </span>
      </label>
     </div>
    </div>

    </div>
    <div className="panel-foot">
     <button
      type="submit"
      disabled={pending}
      className="btn btn-primary"
     >
      {pending ? "Saving…" : "Save settings"}
     </button>
     <Status state={state} />
    </div>
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
   <div className="panel">
    <div className="panel-head">
     <div>
      <h2 className="panel-title">Backups</h2>
      <p className="panel-desc">
       A VACUUM INTO snapshot of the database, saved to <code className="rounded bg-muted px-1">data/backups/</code>.
      </p>
     </div>
     {/* VACUUM INTO can take >5s on busy disks — the assertion in the e2e
       test also uses a generous timeout. No change needed here. */}
     <button
      onClick={() => void createAction()}
      disabled={creating}
      className="btn btn-primary btn-sm"
     >
      {creating ? "Creating…" : "Create backup"}
     </button>
    </div>
    <div className="panel-body">
    <Status state={createState} />

    {rows.length === 0 ? (
     <div className="empty">
      <p className="text-sm font-medium">No backups yet</p>
      <p className="hint mt-1">Create your first snapshot to protect the database.</p>
     </div>
    ) : (
     <div className="table-wrap">
      <table className="console-table">
       <thead>
        <tr>
         <th>Created</th>
         <th>Kind</th>
         <th>Status</th>
         <th className="num">Size</th>
         <th><span className="sr-only">Actions</span></th>
        </tr>
       </thead>
       <tbody>
        {rows.map((b) => (
         <tr key={b.id}>
          <td className="tabular">{new Date(b.created_at).toLocaleString()}</td>
          <td className="text-muted-foreground">{b.kind}</td>
          <td>
           <span
            className={`badge ${
             b.status === "done"
              ? "badge-ok"
              : "badge-neutral"
            }`}
           >
            <span className="badge-dot" aria-hidden />
            {b.status}
           </span>
          </td>
          <td className="num tabular text-muted-foreground">{formatBytes(b.size_bytes)}</td>
          <td>
           <div className="flex justify-end gap-1">
            <Link
             href={`/api/backups/${b.id}/download`}
             className="btn btn-ghost btn-sm"
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
    className="btn btn-ghost btn-sm"
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
     className="btn btn-ghost btn-sm"
    >
     {pending ? "Restoring…" : "Restore"}
    </button>
  </span>
 );
}

export function SecretsForm({
 hasAiKey,
 hasYdcKey,
 aiModel,
 aiBaseUrl,
 mailProvider,
 hasMailKey,
 mailFrom,
}: {
 hasAiKey: boolean;
 hasYdcKey: boolean;
 aiModel: string;
 aiBaseUrl: string;
 mailProvider: string;
 hasMailKey: boolean;
 mailFrom: string;
}) {
  const [state, action, pending] = useActionState(updateSecretsAction, undefined);
  return (
   <form action={action} className="panel">
    <div className="panel-head">
     <div>
      <h2 className="panel-title">API Keys — managed in panel (no .env hassle)</h2>
      <p className="panel-desc">
       All keys stored encrypted (AES-256-GCM via <code className="rounded bg-muted px-1">APP_ENC_KEY</code>) in the panel DB. Leave blank to keep existing. Env vars remain fallback.
      </p>
     </div>
    </div>
    <div className="panel-body">
    <div className="grid gap-4 sm:grid-cols-2">
     <div className="field">
      <label htmlFor="ai_api_key" className="label">
       AI API Key (OpenAI / Anthropic)
      </label>
      <input
       id="ai_api_key"
       name="ai_api_key"
       type="password"
       placeholder={hasAiKey ? "•••••••• (set) — leave blank to keep" : "sk-..."}
       className="input"
      />
      {hasAiKey && (
       <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="clear_ai_api_key" value="on" className="h-3.5 w-3.5" />
        Clear this key on save
       </label>
      )}
      <p className="hint">Powers AI Studio: hook angles, spam score, translate, URL→campaign, image.</p>
     </div>
     <div className="field">
      <label htmlFor="ai_model" className="label">
       AI Model
      </label>
      <input id="ai_model" name="ai_model" defaultValue={aiModel} placeholder="gpt-4o-mini" className="input" />
      {aiModel && (
       <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="clear_ai_model" value="on" className="h-3.5 w-3.5" />
        Clear on save
       </label>
      )}
     </div>
     <div className="field sm:col-span-2">
      <label htmlFor="ai_base_url" className="label">
       AI Base URL
      </label>
      <input
       id="ai_base_url"
       name="ai_base_url"
       defaultValue={aiBaseUrl}
       placeholder="https://api.openai.com/v1"
       className="input"
      />
      {aiBaseUrl && (
       <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="clear_ai_base_url" value="on" className="h-3.5 w-3.5" />
        Clear on save
       </label>
      )}
     </div>
     <div className="field sm:col-span-2">
      <label htmlFor="ydc_api_key" className="label">
       You.com API Key <span className="font-normal text-muted-foreground">(optional — web grounding)</span>
      </label>
      <input
       id="ydc_api_key"
       name="ydc_api_key"
       type="password"
       placeholder="ydc_... — leave blank to keep · free tier works without key"
       className="input"
      />
      {hasYdcKey && (
       <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="clear_ydc_api_key" value="on" className="h-3.5 w-3.5" />
        Clear this key on save
       </label>
      )}
      <p className="hint">
       Powers URL→Campaign enrichment + hook research via you.com Search. Get free 200 credits at you.com. Leave blank to use heuristic fallback.
      </p>
     </div>
     <div className="field">
      <label htmlFor="mail_provider" className="label">
       Mail Provider
      </label>
      <select id="mail_provider" name="mail_provider" defaultValue={mailProvider} className="select">
       <option value="">— none —</option>
       <option value="resend">Resend</option>
       <option value="brevo">Brevo</option>
       <option value="ses">AWS SES</option>
       <option value="smtp">SMTP</option>
      </select>
      {mailProvider && (
       <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="clear_mail_provider" value="on" className="h-3.5 w-3.5" />
        Clear on save
       </label>
      )}
     </div>
     <div className="field">
      <label htmlFor="mail_api_key" className="label">
       Mail API Key
      </label>
      <input
       id="mail_api_key"
       name="mail_api_key"
       type="password"
       placeholder={hasMailKey ? "•••••••• (set)" : "re_... / xkeysib-..."}
       className="input"
      />
      {hasMailKey && (
       <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="clear_mail_api_key" value="on" className="h-3.5 w-3.5" />
        Clear this key on save
       </label>
      )}
     </div>
     <div className="field sm:col-span-2">
      <label htmlFor="mail_from" className="label">
       Mail From (verified domain)
      </label>
      <input id="mail_from" name="mail_from" type="email" defaultValue={mailFrom} placeholder="news@yourdomain.com" className="input" />
      {mailFrom && (
       <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="clear_mail_from" value="on" className="h-3.5 w-3.5" />
        Clear on save
       </label>
      )}
     </div>
    </div>
    </div>
    <div className="panel-foot">
     <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? "Saving…" : "Save API Keys"}
     </button>
     <TestConnectionButton provider="ai" label="Test AI" />
     <TestConnectionButton provider="you" label="Test You.com" />
     <TestConnectionButton provider="mail" label="Test Mail" />
     <Status state={state} />
    </div>
   </form>
  );
 }

export function GDriveForm({ enabled, folderId, hasServiceJson }: { enabled: boolean; folderId: string; hasServiceJson: boolean }) {
  const [state, action, pending] = useActionState(updateGDriveAction, undefined);
  return (
   <form action={action} className="panel">
    <div className="panel-head">
     <div>
      <h2 className="panel-title">Google Drive Auto-Backup</h2>
      <p className="panel-desc">
       Disabled by default. Enable to auto-upload every <code className="rounded bg-muted px-1">VACUUM INTO</code> snapshot to Drive. For personal single-tenant, share a Drive folder with your Service Account email.
      </p>
     </div>
    </div>
    <div className="panel-body">
    <label className="check-card">
     <input type="checkbox" name="gdrive_enabled" value="on" defaultChecked={enabled} />
     <span>
      <span className="check-title">Enable Google Drive upload</span>
      <span className="check-desc">Upload after each backup (manual + auto).</span>
     </span>
    </label>
    <div className="field">
     <label htmlFor="gdrive_folder_id" className="label">
      Drive Folder ID (optional)
     </label>
     <input id="gdrive_folder_id" name="gdrive_folder_id" defaultValue={folderId} placeholder="1aB2cDeFgHiJkL — leave empty for My Drive root" className="input" />
     <p className="hint">Find in Drive URL: https://drive.google.com/drive/folders/{"<ID>"}</p>
    </div>
    <div className="field">
     <label htmlFor="gdrive_service_json" className="label">
      Service Account JSON {hasServiceJson ? "(already set — paste to replace)" : ""}
     </label>
     <textarea
      id="gdrive_service_json"
      name="gdrive_service_json"
      rows={4}
      placeholder='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----...","client_email":"...@...iam.gserviceaccount.com"}'
      className="textarea font-mono text-xs"
     />
     <p className="hint">Stored encrypted. Share your Drive folder with the service account email (Viewer or Editor).</p>
    </div>
    <div className="form-note">
     <p className="font-medium text-foreground">How to get JSON:</p>
     <ol className="ml-4 list-decimal space-y-1">
      <li>GCP Console → IAM → Service Accounts → Create → Enable Drive API</li>
      <li>Keys → Add Key → JSON → download</li>
      <li>Drive → New Folder → Share → paste service account email</li>
      <li>Paste JSON above → Save → Test with “Create backup” → check Drive</li>
     </ol>
    </div>
    </div>
    <div className="panel-foot">
     <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? "Saving…" : "Save Drive Settings"}
     </button>
     <TestConnectionButton provider="drive" label="Test Drive" />
     <Status state={state} />
    </div>
   </form>
  );
 }


export function OutboundWebhookForm({ url, hasSecret }: { url: string; hasSecret: boolean }) {
  const [state, action, pending] = useActionState(updateOutboundAction, undefined);
  return (
   <form action={action} className="panel">
    <div className="panel-head">
     <div>
      <h2 className="panel-title">Outbound event webhooks</h2>
      <p className="panel-desc">
       POSTs HMAC-signed JSON to your endpoint on{" "}
       <code className="rounded bg-muted px-1">subscribed</code>,{" "}
       <code className="rounded bg-muted px-1">unsubscribed</code>,{" "}
       <code className="rounded bg-muted px-1">clicked</code> and{" "}
       <code className="rounded bg-muted px-1">campaign_done</code> events — plug straight into n8n, Zapier or
       your own backend. Clear the URL to disable.
      </p>
     </div>
    </div>
    <div className="panel-body">
    <div className="field">
     <label htmlFor="outbound_webhook_url" className="label">
      Webhook URL {url ? "(active)" : ""}
     </label>
     <input
      id="outbound_webhook_url"
      name="outbound_webhook_url"
      type="url"
      defaultValue={url}
      placeholder="https://n8n.example.com/webhook/pushpanel"
      className="input"
     />
    </div>
    <div className="field">
     <label htmlFor="outbound_webhook_secret" className="label">
      Signing secret {hasSecret ? "(set — leave blank to keep)" : "(optional but recommended)"}
     </label>
     <input
      id="outbound_webhook_secret"
      name="outbound_webhook_secret"
      type="password"
      autoComplete="off"
      placeholder={hasSecret ? "••••••••" : "whsec_..."}
      className="input"
     />
     <p className="hint">
      Verify header <code className="rounded bg-muted px-1">X-PushPanel-Signature</code> as{" "}
      <code className="rounded bg-muted px-1">sha256=HMAC(secret, timestamp + &quot;.&quot; + body)</code>.
     </p>
    </div>
    </div>
    <div className="panel-foot">
     <button
      type="submit"
      disabled={pending}
      className="btn btn-primary"
     >
      {pending ? "Saving…" : "Save webhooks"}
     </button>
     <Status state={state} />
    </div>
   </form>
  );
 }
