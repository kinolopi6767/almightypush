import { db } from "@/lib/db";
import { aiGenerations, settings } from "@pushpanel/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AIStudioPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : 0;
  const gens = wsId ? db.select().from(aiGenerations).where(eq(aiGenerations.workspace_id, wsId)).orderBy(desc(aiGenerations.id)).limit(20).all() : [];

  // Check if you.com grounding is available (env or panel secret)
  const hasYdcKey =
    !!process.env.YDC_API_KEY ||
    !!process.env.YOU_API_KEY ||
    !!db.select().from(settings).where(eq(settings.key, "secret:ydc_api_key")).get?.();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          9 tools · heuristic offline + LLM when <code className="rounded bg-muted px-1 font-mono text-xs">AI_API_KEY</code> set · {hasYdcKey ? "you.com web grounding active" : "add YDC_API_KEY for live web grounding"} · personal unlimited.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="font-medium">Hook Angles</h3>
          <p className="mt-1 text-xs text-muted-foreground">POST <code className="font-mono">/api/v1/ai/hook</code> {`{topic, count 1-10}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">5 frameworks: curiosity / contrast / proof / pain / outcome</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="font-medium">Spam Score</h3>
          <p className="mt-1 text-xs text-muted-foreground">POST <code className="font-mono">/api/v1/ai/spam-score</code> {`{title, body}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">0-100, low/medium/high + trigger words</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="font-medium">Translate</h3>
          <p className="mt-1 text-xs text-muted-foreground">POST <code className="font-mono">/api/v1/ai/translate</code> {`{text, lang}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">6+ languages · panel or env key</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="font-medium">URL → Campaign</h3>
          <p className="mt-1 text-xs text-muted-foreground">POST <code className="font-mono">/api/v1/ai/url-to-campaign</code> {`{url}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">OG scrape → title/desc/image draft</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="font-medium">Smart Send</h3>
          <p className="mt-1 text-xs text-muted-foreground">OneSignal Intelligent Delivery: histogram per hour → best slot</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">smartSendSlot(hours: number[])</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="font-medium">Fatigue Shield</h3>
          <p className="mt-1 text-xs text-muted-foreground">Daily cap (Settings → personal 3/day) + transactional bypass</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">shouldSuppressByFatigue(sentToday, cap)</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="font-medium">AutoMagic AI</h3>
          <p className="mt-1 text-xs text-muted-foreground">RSS/WP → AI title/message generation</p>
          <p className="mt-1 text-xs text-muted-foreground">Set in Automation → autoMagic</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h3 className="font-medium">Image</h3>
          <p className="mt-1 text-xs text-muted-foreground">POST <code className="font-mono">/api/v1/ai/image</code> {`{prompt}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Placeholder picsum until API key set</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] ring-1 ring-primary/10">
          <h3 className="font-medium">Web Research <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">you.com</span></h3>
          <p className="mt-1 text-xs text-muted-foreground">POST <code className="font-mono">/api/v1/ai/research</code> {`{query, mode: search|research}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Live web snippets or deep cited research — powers hook grounding + URL→Campaign</p>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Recent generations</h3>
        <p className="mt-1 text-xs text-muted-foreground">Last 20 · encrypted at rest via <code className="font-mono text-xs">APP_ENC_KEY</code> · unlimited for personal use</p>
        {gens.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No generations yet — try Hook Angles from your app or AI Studio API.</p>
        ) : (
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">{JSON.stringify(gens, null, 2)}</pre>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Configure keys at <code className="rounded bg-muted px-1 font-mono text-xs">Dashboard → Settings → API Keys</code> — no .env edit needed.</p>
    </div>
  );
}
