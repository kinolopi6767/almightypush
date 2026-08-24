"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";

/**
 * Warn before leaving a form with unsaved changes.
 *
 * - `beforeunload` covers tab close / hard navigation (browser-native dialog).
 * - In-app Link navigations are intercepted via a capture-phase click listener
 *   and a native confirm() — the same UX as the destructive-action confirms.
 *
 * `dirty` must be a boolean ref-like value read at event time; pass a getter
 * to avoid stale closures. Attach <UseDirtyGuard dirty={...} /> INSIDE the
 * <form> so useFormStatus can also treat an in-flight submit as "clean".
 */
export function UseDirtyGuard({ dirty }: { dirty: () => boolean }) {
  const { pending } = useFormStatus();

  useEffect(() => {
    if (pending) return;

    const isDirty = () => {
      try {
        return dirty();
      } catch {
        return false;
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      e.preventDefault();
      // Legacy requirement for Chrome/Edge
      e.returnValue = "";
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!isDirty()) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      // Allow the skip link and sign-out — they are deliberate exits.
      if (anchor.getAttribute("href") === "#main-content") return;
      if (!window.confirm("You have unsaved changes. Leave anyway?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty, pending]);

  return null;
}
