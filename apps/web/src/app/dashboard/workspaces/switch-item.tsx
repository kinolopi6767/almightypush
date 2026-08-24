"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchWorkspaceAction } from "./actions";

export function WorkspaceSwitchItem({ workspaceId }: { workspaceId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await switchWorkspaceAction(workspaceId);
          if (!res?.error) router.refresh();
        })
      }
      className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-50"
    >
      {pending ? "Switching…" : "Switch"}
    </button>
  );
}
