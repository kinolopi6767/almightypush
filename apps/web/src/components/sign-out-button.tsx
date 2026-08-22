"use client";

import { useFormStatus } from "react-dom";

/** Sign-out submit button with pending state (used inside the sign-out form). */
export function SignOutButton({
  children,
  pendingLabel,
  className,
  title,
}: {
  children?: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      className={className}
    >
      {pending ? (pendingLabel ?? "Signing out…") : (children ?? "Sign out")}
    </button>
  );
}
