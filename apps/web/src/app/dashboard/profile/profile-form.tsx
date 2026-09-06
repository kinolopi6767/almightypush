"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileFormState } from "./actions";

export function ProfileForm({ name }: { name: string }) {
 const [state, action, pending] = useActionState(
  (_prev: ProfileFormState, formData: FormData) => updateProfileAction(_prev, formData),
  undefined,
 );

 return (
  <form action={action} className="max-w-md space-y-4 panel p-4">
   <div className="space-y-1">
    <label htmlFor="name" className="text-sm font-medium">
     Name
    </label>
    <input
     id="name"
     name="name"
     defaultValue={name}
     required
     className="input"
    />
   </div>

   <div className="space-y-1">
    <label htmlFor="currentPassword" className="text-sm font-medium">
     Current password
    </label>
    <input
     id="currentPassword"
     name="currentPassword"
     type="password"
     required
     autoComplete="current-password"
     className="input"
    />
   </div>

   <div className="space-y-1">
    <label htmlFor="newPassword" className="text-sm font-medium">
     New password
    </label>
    <input
     id="newPassword"
     name="newPassword"
     type="password"
     autoComplete="new-password"
     placeholder="Leave blank to keep current"
     className="input"
    />
    <p className="text-xs text-muted-foreground">At least 10 characters.</p>
   </div>

   <button
    type="submit"
    disabled={pending}
    className="btn btn-primary"
   >
    {pending ? "Saving…" : "Save profile"}
   </button>

   {state?.ok && <p className="form-ok">Profile updated.</p>}
   {state?.error && <p className="form-alert">{state.error}</p>}
  </form>
 );
}
