"use client";

import { useActionState, useEffect, useState } from "react";
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

  return (
    <form action={formAction} className="rounded-xl border bg-card p-5">
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
          <input
            id="url"
            name="url"
            type="url"
            value={launchUrl}
            onChange={(e) => setLaunchUrl(e.target.value)}
            placeholder="https://app.example.com/sale"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
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
          <p className="mt-1 text-xs text-muted-foreground">Leave empty to send immediately.</p>
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
