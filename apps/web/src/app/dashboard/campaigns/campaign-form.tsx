"use client";

/** Stable per-row ids for deletable form rows (React key hygiene). */
let __rowSeq = 0;
const nextRid = () => `row-${Date.now().toString(36)}-${++__rowSeq}`;

import { Fragment, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignAction, type CampaignFormState } from "./actions";

export function CampaignForm({
  domains,
  segments,
  templates,
}: {
  domains: { id: number; name: string }[];
  segments: { id: number; name: string; estimate_count: number | null }[];
  templates: { id: number; name: string; title: string | null; message: string | null; launch_url: string | null }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CampaignFormState, FormData>(createCampaignAction, undefined);
  const [audienceKind, setAudienceKind] = useState<"all" | "segment">("all");
  const [segmentId, setSegmentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [launchUrl, setLaunchUrl] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  // Rows carry a stable local id so React keeps input DOM/focus when a
  // middle row is deleted (index keys would remap controlled inputs).
  const [buttons, setButtons] = useState<{ rid: string; label: string; url: string }[]>([{ rid: nextRid(), label: "", url: "" }]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Advanced delivery controls (LumaPush parity: topic/TTL/urgency/channel/variants)
  const [channel, setChannel] = useState<"push" | "email">("push");
  const [topic, setTopic] = useState("");
  const [ttl, setTtl] = useState("86400");
  const [urgency, setUrgency] = useState<"very-low" | "low" | "normal" | "high">("normal");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [variants, setVariants] = useState<{ rid: string; title: string; message?: string; weight: number }[]>([]);
  const [showVariants, setShowVariants] = useState(false);

  /** B2: og-scrape the click URL and prefill title/message/icon. */
  async function fetchContent() {
    if (!launchUrl.trim()) {
      setFetchError("Enter a URL first.");
      return;
    }
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/fetch-content?url=${encodeURIComponent(launchUrl)}`);
      const body = (await res.json()) as { ok?: boolean; error?: string; title?: string; description?: string; image?: string };
      if (!body.ok) {
        setFetchError(body.error ?? "Could not read that page.");
        return;
      }
      if (body.title && !title) setTitle(body.title);
      if (body.description && !message) setMessage(body.description);
      if (body.image && !iconUrl) setIconUrl(body.image);
      if (!body.title && !body.description && !body.image) setFetchError("No title, description or image found on that page.");
    } catch {
      setFetchError("Request failed.");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (state?.ok && state.id) router.push(`/dashboard/campaigns/${state.id}`);
  }, [state, router]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => String(x.id) === id);
    if (t) {
      if (t.title) setTitle(t.title);
      if (t.message !== null) setMessage(t.message);
      if (t.launch_url) setLaunchUrl(t.launch_url);
    }
  };

  const updateButton = (index: number, field: "label" | "url", value: string) => {
    setButtons((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value.slice(0, field === "label" ? 24 : 500) } : b)));
  };

  const removeButton = (index: number) => setButtons((prev) => prev.filter((_, i) => i !== index));

  const addButton = () => setButtons((prev) => (prev.length >= 3 ? prev : [...prev, { rid: nextRid(), label: "", url: "" }]));

  const filledButtons = buttons.filter((b) => b.label.trim() || b.url.trim());

  const updateVariant = (i: number, patch: Partial<(typeof variants)[number]>) =>
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const removeVariant = (i: number) => setVariants((prev) => prev.filter((_, idx) => idx !== i));
  const addVariant = () =>
    setVariants((prev) => (prev.length >= 20 ? prev : [...prev, { rid: nextRid(), title: "", weight: 10 }]));

  return (
    <form action={formAction} className="rounded-xl border bg-card p-5">
      {/* Hidden fields for advanced variant/ delivery plumbing */}
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="topic" value={topic} />
      <input type="hidden" name="ttl" value={ttl} />
      <input type="hidden" name="urgency" value={urgency} />
      {variants.length > 0 && (
        <input
          type="hidden"
          name="variantsJson"
          value={JSON.stringify(variants.map(({ rid: _rid, title, message, weight }) => ({ title, message, weight })))}
        />
      )}
      <h2 className="font-semibold">New campaign</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The worker starts the campaign the moment it is due and queues a delivery for every active subscriber.
      </p>
      <div className="mt-4 space-y-3">
        {templates.length > 0 && (
          <div>
            <label htmlFor="templateId" className="text-sm font-medium">
              Start from template
            </label>
            <select
              id="templateId"
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— blank —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {templateId !== "" && <input type="hidden" name="templateId" value={templateId} />}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="domainId" className="text-sm font-medium">
              Domain
            </label>
            <select
              id="domainId"
              name="domainId"
              required
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a domain…</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="channel" className="text-sm font-medium">
              Channel
            </label>
            <select
              id="channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as "push" | "email")}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="push">Push (VAPID)</option>
              <option value="email">Email</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Push uses VAPID; email uses verified sending domain.</p>
          </div>
        </div>
        <div>
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Big sale this weekend"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="titleB" className="text-sm font-medium">
            B title <span className="font-normal text-muted-foreground">(quick 50/50 — or use Variants below for up to 20)</span>
          </label>
          <input
            id="titleB"
            name="titleB"
            maxLength={120}
            defaultValue=""
            placeholder="Big sale this weekend — now!"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Half gets original, half gets B. For weighted multi-variant (up to 20), use the Variants builder below.
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <button
            type="button"
            onClick={() => setShowVariants((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-medium"
          >
            <span>A/B Variants (up to 20, weighted) — LumaPush / OneSignal parity</span>
            <span className="text-muted-foreground">{showVariants ? "Hide" : `Show ${variants.length ? `(${variants.length})` : ""}`}</span>
          </button>
          {showVariants && (
            <div className="mt-3 space-y-2">
              {variants.map((v, i) => (
                <div key={v.rid} className="grid grid-cols-[1fr_1fr_80px_auto] gap-2">
                  <input
                    placeholder="Title"
                    value={v.title}
                    onChange={(e) => updateVariant(i, { title: e.target.value })}
                    maxLength={120}
                    className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    placeholder="Message (optional)"
                    value={v.message ?? ""}
                    onChange={(e) => updateVariant(i, { message: e.target.value })}
                    maxLength={500}
                    className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={v.weight}
                    onChange={(e) => updateVariant(i, { weight: Math.max(1, Math.min(100, Number(e.target.value) || 10)) })}
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    title="Weight 1-100"
                  />
                  <button type="button" onClick={() => removeVariant(i)} aria-label={`Remove variant ${i + 1}`} className="rounded-md border px-3 text-sm hover:bg-muted">
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={addVariant} disabled={variants.length >= 20} className="rounded-md border border-dashed px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
                  + Add variant
                </button>
                {variants.length > 0 && (
                  <span className="text-xs text-muted-foreground self-center">Total weight: {variants.reduce((s, x) => s + x.weight, 0)} · deterministic LCG per subscriber</span>
                )}
              </div>
              {variants.length > 0 && variants.length < 2 && (
                <p className="text-xs text-amber-600">Need at least 2 variants to activate A/B.</p>
              )}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="message" className="text-sm font-medium">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            maxLength={500}
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Everything is 50% off until Sunday."
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="url" className="text-sm font-medium">
            Click URL
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="url"
              name="url"
              type="url"
              value={launchUrl}
              onChange={(e) => setLaunchUrl(e.target.value)}
              placeholder="https://app.example.com/sale"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => void fetchContent()}
              disabled={fetching}
              className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              title="Fetch title/message/icon from the page (og-scrape)"
            >
              {fetching ? "Fetching…" : "Fetch from URL"}
            </button>
          </div>
          {fetchError && <p className="mt-1 text-xs text-destructive">{fetchError}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="iconUrl" className="text-sm font-medium">
              Icon URL
            </label>
            <input
              id="iconUrl"
              name="iconUrl"
              type="url"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/icon.png"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="imageUrl" className="text-sm font-medium">
              Image URL
            </label>
            <input
              id="imageUrl"
              name="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/banner.png"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div>
          <span className="text-sm font-medium">Action buttons</span>
          <p className="mt-0.5 text-xs text-muted-foreground">Shown below the notification on desktop. Up to 3.</p>
          {filledButtons.map((b, i) => (
            <div key={b.rid} className="mt-2 grid grid-cols-[1fr_1.4fr_auto] gap-2">
              <input
                aria-label={`Button ${i + 1} label`}
                value={b.label}
                onChange={(e) => updateButton(i, "label", e.target.value)}
                placeholder="Label"
                maxLength={24}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                aria-label={`Button ${i + 1} URL`}
                value={b.url}
                onChange={(e) => updateButton(i, "url", e.target.value)}
                placeholder="https://example.com/x"
                type="url"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => removeButton(i)}
                aria-label={`Remove button ${i + 1}`}
                className="rounded-md border px-3 text-sm text-muted-foreground hover:bg-muted"
              >
                ✕
              </button>
            </div>
          ))}
          {buttons.length < 3 && (
            <button
              type="button"
              onClick={addButton}
              className="mt-2 rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              + Add button
            </button>
          )}
          {buttons.filter((b) => b.label.trim() && b.url.trim()).map((b) => (
            <Fragment key={b.rid}>
              <input type="hidden" name="buttonLabel" value={b.label} />
              <input type="hidden" name="buttonUrl" value={b.url} />
            </Fragment>
          ))}
        </div>
        <div>
          <label htmlFor="schedule" className="text-sm font-medium">
            Schedule (optional)
          </label>
          <input
            id="schedule"
            name="schedule"
            type="datetime-local"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">Leave empty to send immediately — interpreted in panel timezone.</p>
        </div>

        <div className="rounded-lg border p-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-medium"
          >
            <span>Delivery options — topic / TTL / urgency (LumaPush)</span>
            <span className="text-muted-foreground">{showAdvanced ? "Hide" : "Show"}</span>
          </button>
          {showAdvanced && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="topic" className="text-sm font-medium">
                  Topic (collapse, 64ch)
                </label>
                <input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value.slice(0, 64))}
                  placeholder="sale-2026-09"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">Notifications with same topic collapse.</p>
              </div>
              <div>
                <label htmlFor="ttl" className="text-sm font-medium">
                  TTL (seconds)
                </label>
                <input
                  id="ttl"
                  type="number"
                  min={0}
                  max={2419200}
                  value={ttl}
                  onChange={(e) => setTtl(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">0 = drop if offline, 86400 = 1 day.</p>
              </div>
              <div>
                <label htmlFor="urgency" className="text-sm font-medium">
                  Urgency
                </label>
                <select
                  id="urgency"
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as typeof urgency)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="very-low">very-low</option>
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <div>
          <span className="text-sm font-medium">Audience</span>
          <div className="mt-1 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="audienceKind"
                value="all"
                checked={audienceKind === "all"}
                onChange={() => setAudienceKind("all")}
              />
              All subscribers of the domain
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="audienceKind"
                value="segment"
                checked={audienceKind === "segment"}
                onChange={() => setAudienceKind("segment")}
              />
              A saved segment
            </label>
{audienceKind === "segment" && (
              <>
                <input type="hidden" name="segmentId" value={segmentId} />
                <div className="mt-1 space-y-2">
                  <select
                    aria-label="Segment"
                    value={segmentId}
                    onChange={(e) => setSegmentId(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Pick a segment…</option>
                    {segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (~{s.estimate_count?.toLocaleString() ?? "…"})
                      </option>
                    ))}
                  </select>
                  {segments.length === 0 && (
                    <p className="text-xs text-muted-foreground">No segments yet — create one on the Segments page first.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {state?.error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create campaign"}
        </button>
      </div>
    </form>
  );
}
