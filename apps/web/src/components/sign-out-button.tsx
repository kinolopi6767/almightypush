"use client";

import { useFormStatus } from "react-dom";

/** Sign-out submit button with pending state (used inside the sign-out form). */
export function SignOutButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
