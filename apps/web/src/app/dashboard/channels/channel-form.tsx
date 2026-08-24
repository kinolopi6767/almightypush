"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createChannelAction, type ChannelFormState } from "./actions";

export function ChannelForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createChannelAction, undefined as ChannelFormState | undefined);
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
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-[background-color,box-shadow,transform] hover:bg-primary-hover active:scale-[0.98]"
      >
        {open ? "Cancel" : "Add channel"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="mt-10 w-full max-w-lg rounded-xl border bg-background p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add YouTube channel">
            <h2 className="text-lg font-semibold">Add YouTube channel</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Creates a landing page that captures push subscribers before sending visitors to your channel.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className={label} htmlFor="channel-url">Channel URL</label>
                <input id="channel-url" name="channel_url" type="url" required className={`mt-1 ${inputCls}`} placeholder="https://www.youtube.com/@handle or /channel/UC…" />
              </div>
              <div>
                <label className={label} htmlFor="channel-prompt">Prompt text</label>
                <input id="channel-prompt" name="prompt_text" maxLength={120} className={`mt-1 ${inputCls}`} placeholder="Subscribe to my channel for updates" />
              </div>
              <div className="flex items-center gap-2">
                <input id="channel-force" name="force_subscribe" type="checkbox" value="1" className="size-4" />
                <label htmlFor="channel-force" className="text-sm font-medium">Require subscription before redirect</label>
              </div>
            </div>

            {state?.error && <p className="mt-3 text-sm text-destructive">{state.error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center rounded-md border px-4 text-sm">Cancel</button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add channel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}