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
  <form action={formAction} className="panel p-4">
   <h2 className="text-[15px] font-semibold tracking-tight">{initial ? "Edit template" : "New template"}</h2>
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
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
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
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
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
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
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
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
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
      className="input mt-1 w-full transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-ring/40"
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
     {pending ? "Saving…" : initial ? "Save template" : "Create template"}
    </button>
   </div>
  </form>
 );
}