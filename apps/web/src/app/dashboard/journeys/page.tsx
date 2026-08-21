import { db } from "@/lib/db";
import { journeys } from "@pushpanel/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function JourneysPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : 0;
  const rows = wsId ? db.select().from(journeys).where(eq(journeys.workspace_id, wsId)).orderBy(desc(journeys.id)).all() : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Journeys</h1>
        <p className="text-sm text-muted-foreground">LumaPush + OneSignal Journeys + Braze Canvas parity: visual trigger → filter → wait → push/email branches.</p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-sm">Canvas JSON (nodes/edges) stored in <code>canvas_json</code>. Trigger types: subscribe, rss, event, api, inactivity. Worker <code>runJourneys()</code> ticks every 60s.</p>
        <pre className="mt-3 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(rows.slice(0, 3), null, 2) || "no journeys yet"}</pre>
      </div>
      <p className="text-xs text-muted-foreground">Create via API <code>POST /api/v1/journeys</code> (LumaPush AI Command Studio will auto-generate).</p>
    </div>
  );
}
