import { db } from "@/lib/db";
import { aiGenerations } from "@pushpanel/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AIStudioPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : 0;
  const gens = wsId ? db.select().from(aiGenerations).where(eq(aiGenerations.workspace_id, wsId)).orderBy(desc(aiGenerations.id)).limit(20).all() : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Studio</h1>
        <p className="text-sm text-muted-foreground">LumaPush 8 tools + OneSignal MCP parity. Heuristic fallbacks work offline; set <code>AI_API_KEY</code> for LLM.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Hook Angles</h3>
          <p className="text-xs text-muted-foreground">POST /api/v1/ai/hook {`{topic, count}`}</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Spam Score</h3>
          <p className="text-xs text-muted-foreground">POST /api/v1/ai/spam-score {`{title, body}`}</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Translate</h3>
          <p className="text-xs text-muted-foreground">POST /api/v1/ai/translate {`{text, lang}`}</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">URL → Campaign</h3>
          <p className="text-xs text-muted-foreground">POST /api/v1/ai/url-to-campaign {`{url}`}</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Smart Send</h3>
          <p className="text-xs text-muted-foreground">OneSignal Intelligent Delivery: last-active histogram per hour → best slot. API `smartSendSlot()`.</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Fatigue Shield</h3>
          <p className="text-xs text-muted-foreground">Frequency cap 3/day (transactional bypass). `shouldSuppressByFatigue()`.</p>
        </div>
      </div>
      <div className="rounded-lg border p-4">
        <h3 className="font-medium">Recent generations</h3>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(gens, null, 2) || "none yet"}</pre>
      </div>
    </div>
  );
}
