"use client";

import { useEffect, useState } from "react";
import { useDialogA11y } from "@/components/use-dialog";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createChannelAction, type ChannelFormState } from "./actions";

export function ChannelForm() {
 const router = useRouter();
 const [state, action, pending] = useActionState(createChannelAction, undefined as ChannelFormState | undefined);
 const [open, setOpen] = useState(false);
 const dialogRef = useDialogA11y(open, () => setOpen(false));

 useEffect(() => {
  if (state?.ok) {
   setOpen(false);
   router.refresh();
  }
 }, [state, router]);

 const label = "label";

 return (
  <form action={action}>
   <button
    type="button"
    aria-expanded={open}
    aria-haspopup="dialog"
    onClick={() => setOpen(!open)}
    className="btn btn-primary"
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
     <div ref={dialogRef} tabIndex={-1} className="mt-10 w-full max-w-lg rounded-md border bg-background p-6 outline-none" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add YouTube channel">
      <h2 className="text-[15px] font-semibold tracking-tight">Add YouTube channel</h2>
      <p className="mt-1 text-sm text-muted-foreground">
       Creates a landing page that captures push subscribers before sending visitors to your channel.
      </p>

      <div className="mt-5 space-y-4">
       <div>
        <label className={label} htmlFor="channel-url">Channel URL</label>
        <input id="channel-url" name="channel_url" type="url" required className={`input mt-1`} placeholder="https://www.youtube.com/@handle or /channel/UC…" />
       </div>
       <div>
        <label className={label} htmlFor="channel-prompt">Prompt text</label>
        <input id="channel-prompt" name="prompt_text" maxLength={120} className={`input mt-1`} placeholder="Subscribe to my channel for updates" />
       </div>
       <div className="flex items-center gap-2">
        <input id="channel-force" name="force_subscribe" type="checkbox" value="1" className="size-4" />
        <label htmlFor="channel-force" className="text-sm font-medium">Require subscription before redirect</label>
       </div>
      </div>

      {state?.error && <p className="mt-3 text-sm text-destructive">{state.error}</p>}

      <div className="mt-6 flex justify-end gap-2">
       <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button>
       <button
        type="submit"
        disabled={pending}
        className="btn btn-primary"
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