"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchWorkspaceAction } from "@/app/dashboard/workspaces/actions";

export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: { id: number; name: string; slug: string | null }[]; currentId: number | null; currentUserWorkspaceId?: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const current = workspaces.find((w) => w.id === currentId);
  const switchTo = (id: number) => {
    start(async () => {
      const res = await switchWorkspaceAction(id);
      if (!res?.error) router.refresh();
      else alert(res.error);
    });
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">Current workspace</label>
      <div className="flex items-center gap-2">
        <select
          value={currentId ?? ""}
          onChange={(e) => {
            const id = Number(e.target.value);
            if (id) switchTo(id);
          }}
          disabled={pending}
          className="h-9 flex-1 rounded-md border bg-card px-3 text-sm"
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name} {ws.id === currentId ? "· active" : ""}
            </option>
          ))}
        </select>
        {pending && <span className="text-xs text-muted-foreground">Switching…</span>}
      </div>
      {current && <p className="text-xs text-muted-foreground">Active: {current.name} (/{current.slug})</p>}
    </div>
  );
}
