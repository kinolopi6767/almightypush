import { NextResponse } from "next/server";
import { requireAiAccess } from "@/lib/ai-guard";
import { generateHookAnglesAI } from "@pushpanel/core";
import { db } from "@/lib/db";
import { aiGenerations } from "@pushpanel/db/schema";
import { getAiConfig } from "@/lib/secrets";
import { z } from "zod";
import { readJsonResult, BODY_LIMITS } from "@/lib/read-body";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  topic: z.string().min(1).max(200),
  count: z.coerce.number().int().min(1).max(10).optional(),
});

export async function POST(req: Request) {
  const gate = await requireAiAccess(req, { limit: 30 });
  if (!gate.ok) return gate.response;
  const wsId = gate.session.user.workspaceId ? Number(gate.session.user.workspaceId) : null;
  if (!wsId) return NextResponse.json({ ok: false, error: "No workspace" }, { status: 400 });

  const rawBody = await readJsonResult(req, BODY_LIMITS.api);
  if (!rawBody.ok) return NextResponse.json({ ok: false, error: rawBody.error }, { status: rawBody.status });
  const parsed = bodySchema.safeParse(rawBody.data);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const aiConfig = getAiConfig();
  try {
    const angles = await generateHookAnglesAI(parsed.data.topic, parsed.data.count ?? 3, {
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      baseUrl: aiConfig.baseUrl,
    });
    const model = aiConfig.apiKey ? aiConfig.model : "heuristic-v1";
    db.insert(aiGenerations)
      .values({ workspace_id: wsId, kind: "hook", prompt: parsed.data.topic, output_json: JSON.stringify(angles), model })
      .run();
    return NextResponse.json({ ok: true, angles, model });
  } catch {
    return NextResponse.json({ ok: false, error: "Generation failed" }, { status: 502 });
  }
}
