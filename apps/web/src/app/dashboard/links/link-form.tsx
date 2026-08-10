"use client";

import { useActionState, useState } from "react";
import { createLinkAction, type LinkFormState } from "./actions";

export function LinkForm({ domains }: { domains: { id: number; name: string }[] }) {
  const [state, formAction, pending] = useActionState<LinkFormState | undefined, FormData>(createLinkAction, undefined);
  const [forced, setForced] = useState(false);

  return (
    <form action={formAction} className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">New link</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A shareable landing page that asks for push permission and then redirects to your target.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="target_url" className="text-sm font-medium">
            Target URL
          </label>
          <input
            id="target_url"
            name="target_url"
            type="url"
            required
            placeholder="https://your-site.com/post"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="prompt_text" className="text-sm font-medium">
            Prompt text
          </label>
          <input
            id="prompt_text"
            name="prompt_text"
            maxLength={120}
            placeholder="Get notified when we publish"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={forced}
            onChange={(e) => setForced(e.target.checked)}
          />
          Force subscribe (no skip option)
        </label>
        <input type="hidden" name="force_subscribe" value={forced ? "1" : "0"} />
        <div>
          <label htmlFor="domain_id" className="text-sm font-medium">
            Domain (for push)
          </label>
          <select
            id="domain_id"
            name="domain_id"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">No push (just redirect)</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="deleted_target_url" className="text-sm font-medium">
            Fallback after delete (optional)
          </label>
          <input
            id="deleted_target_url"
            name="deleted_target_url"
            type="url"
            placeholder="Where deleted links redirect"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
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
          {pending ? "Creating…" : "Create link"}
        </button>
      </div>
    </form>
  );
}