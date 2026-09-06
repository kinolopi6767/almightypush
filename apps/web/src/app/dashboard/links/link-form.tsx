"use client";

import { useActionState, useState } from "react";
import { createLinkAction, type LinkFormState } from "./actions";

export function LinkForm({ domains }: { domains: { id: number; name: string }[] }) {
 const [state, formAction, pending] = useActionState<LinkFormState | undefined, FormData>(createLinkAction, undefined);
 const [forced, setForced] = useState(false);

 return (
  <form action={formAction} className="panel p-4">
    <h2 className="text-[15px] font-semibold tracking-tight">New link</h2>
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
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
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
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
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
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
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
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
     />
    </div>

    {state?.error && (
     <p role="alert" className="form-alert">
      {state.error}
     </p>
    )}

    <button
     type="submit"
     disabled={pending}
     className="btn btn-primary"
    >
     {pending ? "Creating…" : "Create link"}
    </button>
   </div>
  </form>
 );
}