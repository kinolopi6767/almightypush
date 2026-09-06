"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchWorkspaceAction } from "@/app/dashboard/workspaces/actions";

export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: { id: number; name: string; slug: string | null }[]; currentId: number | null; currentUserWorkspaceId?: number | null }) {
 const router = useRouter();
 const [pending, start] = useTransition();
 const [error, setError] = useState<string | null>(null);

 const current = workspaces.find((w) => w.id === currentId);
 const switchTo = (id: number) => {
  setError(null);
  start(async () => {
   const res = await switchWorkspaceAction(id);
   if (!res?.error) router.refresh();
   else setError(res.error);
  });
 };

  return (
   <div className="space-y-2">
    <label htmlFor="ws-select" className="label text-xs">
     Current workspace
    </label>
    <div className="flex items-center gap-2">
     <select
      id="ws-select"
      value={currentId ?? ""}
      onChange={(e) => {
       const id = Number(e.target.value);
       if (id) switchTo(id);
      }}
      disabled={pending}
      className="select flex-1"
     >
      {workspaces.map((ws) => (
       <option key={ws.id} value={ws.id}>
        {ws.name} {ws.id === currentId ? "· active" : ""}
       </option>
      ))}
     </select>
     {pending && <span className="hint whitespace-nowrap">Switching…</span>}
    </div>
    {error && <p role="alert" className="field-error">{error}</p>}
    {current && <p className="hint">Active: {current.name} (/{current.slug})</p>}
   </div>
  );
}
