"use client";

import { useActionState } from "react";
import { createTemplateAction, updateTemplateAction, type TemplateFormState } from "./actions";
import type { TemplatePayload } from "./payload";

interface TemplateFormProps {
  initial?: TemplatePayload;
}

export function TemplateForm({ initial }: TemplateFormProps) {
  const [state, formAction, pending] = useActionState<TemplateFormState | undefined, FormData>(
    initial
      ? (_prev: TemplateFormState | undefined, fd: FormData) => updateTemplateAction(initial.id, fd)
      : createTemplateAction,
    undefined,
  );

  return (
    <form action={formAction} className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">{initial ? "Edit template" : "New template"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Reusable push payloads — pick one when creating a campaign and it pre-fills the fields.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={100}
            defaultValue={initial?.name}
            placeholder="Flash sale"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
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
            defaultValue={initial?.title ?? ""}
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
            defaultValue={initial?.message ?? ""}
            placeholder="Everything is 50% off until Sunday."
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="launch_url" className="text-sm font-medium">
            Click URL
          </label>
          <input
            id="launch_url"
            name="launch_url"
            type="url"
            defaultValue={initial?.launch_url ?? ""}
            placeholder="https://app.example.com/sale"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="icon_url" className="text-sm font-medium">
            Icon URL
          </label>
          <input
            id="icon_url"
            name="icon_url"
            type="url"
            defaultValue={initial?.icon_url ?? ""}
            placeholder="https://example.com/icon.png"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="image_url" className="text-sm font-medium">
            Image URL
          </label>
          <input
            id="image_url"
            name="image_url"
            type="url"
            defaultValue={initial?.image_url ?? ""}
            placeholder="https://example.com/banner.png"
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
          {pending ? "Saving…" : initial ? "Save template" : "Create template"}
        </button>
      </div>
    </form>
  );
}