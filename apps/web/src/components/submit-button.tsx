"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for plain <form action={serverAction}> forms — disables
 * itself while the action is in flight (prevents double-submit) and shows
 * a pending label. Must be rendered INSIDE the form.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "",
  confirm,
  title,
}: {
  children: React.ReactNode;
  /** Label shown while submitting (defaults to children). */
  pendingLabel?: string;
  className?: string;
  /** Optional native confirm() message before submit. */
  confirm?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={className}
    >
      {pending ? (pendingLabel ?? "…") : children}
    </button>
  );
}
