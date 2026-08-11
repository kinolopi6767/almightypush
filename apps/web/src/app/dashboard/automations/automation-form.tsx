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
const TYPES = ["welcome_push", "push_on_publish", "automagic_dynamic", "automagic_static", "youtube_push", "rss_push"] as const;
const TYPE_LABEL: Record<string, string> = {
  welcome_push: "Welcome push",
  push_on_publish: "Push on publish (webhook)",
  automagic_dynamic: "AutoMagic dynamic",
  automagic_static: "AutoMagic static",
  youtube_push: "YouTube push",
  rss_push: "RSS publish",
};

const TYPE_DETAILS: Record<string, string> = {
  welcome_push: "Sent once to every new subscriber of the domain.",
  push_on_publish: "Triggered by a signed webhook whenever you publish. Run now or via API.",
  automagic_dynamic: "Fetches the newest posts from a WordPress REST API and sends a random pick.",
  automagic_static: "Rotates through a curated list of messages on an interval.",
  youtube_push: "Polls a channel RSS feed and pushes when a new video appears.",
  rss_push: "Polls any RSS/Atom feed and pushes when a new item appears.",
};

export function AutomationForm({ domains }: { domains: DomainOption[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createAutomationAction, undefined as AutomationFormState | undefined);
  const [type, setType] = useState<string>("welcome_push");
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
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
      >
        {open ? "Cancel" : "New automation"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="mt-10 w-full max-w-lg rounded-xl border bg-background p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New automation">
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