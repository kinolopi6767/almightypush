"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createAutomationAction, type AutomationFormState } from "./actions";

interface DomainOption {
  id: number;
  name: string;
}

// Mirrors @pushpanel/core AUTOMATION_TYPES — kept client-side so the client
// bundle never imports packages that pull native bindings (argon2) into it.
const TYPES = ["welcome_push", "push_on_publish", "automagic_dynamic", "automagic_static", "youtube_push", "rss_push", "drip"] as const;
const TYPE_LABEL: Record<string, string> = {
  welcome_push: "Welcome push",
  push_on_publish: "Push on publish (webhook)",
  automagic_dynamic: "AutoMagic dynamic",
  automagic_static: "AutoMagic static",
  youtube_push: "YouTube push",
  rss_push: "RSS publish",
  drip: "Drip sequence",
};

const TYPE_DETAILS: Record<string, string> = {
  welcome_push: "Sent once to every new subscriber of the domain.",
  push_on_publish: "Triggered by a signed webhook whenever you publish. Run now or via API.",
  automagic_dynamic: "Fetches the newest posts from a WordPress REST API and sends a random pick.",
  automagic_static: "Rotates through a curated list of messages on an interval.",
  youtube_push: "Polls a channel RSS feed and pushes when a new video appears.",
  rss_push: "Polls any RSS/Atom feed and pushes when a new item appears.",
  drip: "A scheduled sequence of pushes — each subscriber receives the steps in order.",
};

const CRON_PRESETS = [
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Twice a day (9:00, 21:00)", value: "0 9,21 * * *" },
  { label: "Daily at 9:00", value: "0 9 * * *" },
  { label: "Weekly, Monday 9:00", value: "0 9 * * 1" },
];

/** Stable per-row id for deletable step rows (React key hygiene). */
let __stepSeq = 0;
const nextStepId = () => `step-${Date.now().toString(36)}-${++__stepSeq}`;

interface DripRow {
  rid: string;
  delay_days: string;
  title: string;
  message: string;
  launch_url: string;
}

export function AutomationForm({ domains }: { domains: DomainOption[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createAutomationAction, undefined as AutomationFormState | undefined);
  const [type, setType] = useState<string>("welcome_push");
  const [cron, setCron] = useState<string>("");
  const [steps, setSteps] = useState<DripRow[]>([{ rid: nextStepId(), delay_days: "0", title: "", message: "", launch_url: "" }]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  const inputCls =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus:border-primary";
  const label = "text-sm font-medium";

  return (
    <form action={action}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-[background-color,box-shadow,transform] hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? "Cancel" : "New automation"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="mt-10 w-full max-w-lg rounded-xl border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New automation">
            <h2 className="text-lg font-semibold">New automation</h2>
            <p className="mt-1 text-sm text-muted-foreground">Run one or more sub-types below.</p>

            <div className="mt-5 space-y-4">
<div>
                <label className={label} htmlFor="automation-name">Name</label>
                <input id="automation-name" name="name" required maxLength={100} className={`mt-1 ${inputCls}`} placeholder="New posts updates" />
              </div>

              <div>
                <label className={label} htmlFor="automation-type">Type</label>
                <select id="automation-type" name="type" value={type} onChange={(e) => setType(e.target.value)} className={`mt-1 ${inputCls}`}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">{TYPE_DETAILS[type]}</p>
              </div>

              <div>
                <label className={label} htmlFor="automation-domain">Domain</label>
                <select id="automation-domain" name="domainId" defaultValue={domains[0]?.id} className={`mt-1 ${inputCls}`}>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={label} htmlFor="automation-title">Notification title</label>
                <input id="automation-title" name="title" required className={`mt-1 ${inputCls}`} placeholder="What's new" />
              </div>

              <div>
                <label className={label} htmlFor="automation-message">Message</label>
                <textarea id="automation-message" name="message" rows={2} className={`mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm`} placeholder="Optional body text" />
              </div>

              <div>
                <label className={label} htmlFor="automation-launch">Launch URL</label>
                <input id="automation-launch" name="launch_url" type="url" className={`mt-1 ${inputCls}`} placeholder="https://…" />
              </div>

              {type === "welcome_push" && (
                <div>
                  <label className={label} htmlFor="automation-delay">Delay (seconds)</label>
                  <input id="automation-delay" name="delay_seconds" type="number" min={0} max={86400} defaultValue={0} className={`mt-1 ${inputCls}`} />
                  <p className="mt-1 text-xs text-muted-foreground">0 = send immediately after subscribe.</p>
                </div>
              )}

              {(type === "automagic_dynamic" || type === "automagic_static" || type === "youtube_push" || type === "rss_push") && (
                <div>
                  <label className={label} htmlFor="automation-interval">Interval (minutes)</label>
                  <input id="automation-interval" name="interval_minutes" type="number" min={1} max={10080} defaultValue={15} className={`mt-1 ${inputCls}`} />
                </div>
              )}

              {(type === "automagic_dynamic" || type === "automagic_static" || type === "youtube_push" || type === "rss_push") && (
                <div>
                  <label className={label} htmlFor="automation-cron">Crontab schedule (optional)</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      id="automation-cron"
                      name="schedule_cron"
                      value={cron}
                      onChange={(e) => setCron(e.target.value)}
                      className={inputCls}
                      placeholder="0 9 * * *"
                    />
                    <select
                      aria-label="Crontab preset"
                      value={""}
                      onChange={(e) => setCron(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Presets…</option>
                      {CRON_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Overrides the interval above when set. 5 fields: minute hour day month weekday —{" "}
                    <a href="https://crontab.guru" target="_blank" rel="noreferrer" className="underline">crontab.guru</a>.
                  </p>
                </div>
              )}

              {type === "automagic_dynamic" && (
                <>
                  <div>
                    <label className={label} htmlFor="automation-source">WordPress site URL</label>
                    <input id="automation-source" name="source_url" type="url" className={`mt-1 ${inputCls}`} placeholder="https://blog.example.com" />
                  </div>
                  <div>
                    <label className={label} htmlFor="automation-range">Post range</label>
                    <input id="automation-range" name="range" type="number" min={1} max={100} defaultValue={10} className={`mt-1 ${inputCls}`} />
                    <p className="mt-1 text-xs text-muted-foreground">Picks randomly from the newest N posts.</p>
                  </div>
                </>
              )}

              {type === "automagic_static" && (
                <div>
                  <label className={label} htmlFor="automation-rotation">Rotation list (JSON)</label>
                  <textarea id="automation-rotation" name="rotation_json" rows={4} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" placeholder='[{"title":"Tip 1"},{"title":"Tip 2","message":"…"}]' />
                </div>
              )}

              {(type === "youtube_push" || type === "rss_push") && (
                <div>
                  <label className={label} htmlFor="automation-feed">Feed URL</label>
                  <input id="automation-feed" name="feed_url" type="url" className={`mt-1 ${inputCls}`} placeholder="https://example.com/feed.xml" />
                </div>
              )}

              {type === "push_on_publish" && (
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  After saving, copy the webhook URL + secret from the automation row and call it (HMAC-signed) whenever you publish. A “Run now” button is also available.
                </p>
              )}

              {type === "drip" && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className={label}>Sequence steps</label>
                    <button
                      type="button"
                      disabled={steps.length >= 10}
                      onClick={() => setSteps([...steps, { rid: nextStepId(), delay_days: "1", title: "", message: "", launch_url: "" }])}
                      className="text-sm font-medium text-primary disabled:opacity-40"
                    >
                      + Add step
                    </button>
                  </div>
                  <input type="hidden" name="step_count" value={steps.length} />
                  <div className="mt-2 space-y-3">
                    {steps.map((step, i) => (
                      <div key={step.rid} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
                          {steps.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                              className="text-xs text-muted-foreground hover:text-destructive"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-[110px_1fr] gap-2">
                          <input name={`steps.${i}.delay_days`} type="number" min={0} max={365} value={step.delay_days}
                            onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, delay_days: e.target.value } : s)))}
                            className={inputCls} aria-label={`Step ${i + 1} delay days`} placeholder="days" />
                          <input name={`steps.${i}.title`} required value={step.title}
                            onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)))}
                            className={inputCls} aria-label={`Step ${i + 1} title`} placeholder="Notification title" />
                          <input name={`steps.${i}.message`} value={step.message}
                            onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, message: e.target.value } : s)))}
                            className={`col-span-2 ${inputCls}`} aria-label={`Step ${i + 1} message`} placeholder="Message (optional)" />
                          <input name={`steps.${i}.launch_url`} type="url" value={step.launch_url}
                            onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, launch_url: e.target.value } : s)))}
                            className={`col-span-2 ${inputCls}`} aria-label={`Step ${i + 1} URL`} placeholder="https://… (optional)" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Steps fire in order for every new subscriber; each delay is measured from the previous step.
                  </p>
                </div>
              )}

              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center rounded-md border px-4 text-sm">Cancel</button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? "Creating…" : "Create automation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}