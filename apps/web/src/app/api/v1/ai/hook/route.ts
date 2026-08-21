import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateHookAnglesAI } from "@pushpanel/core";
import { db } from "@/lib/db";
import { aiGenerations } from "@pushpanel/db/schema";
import { getAiConfig } from "@/lib/secrets";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  topic: z.string().min(1).max(200),
  count: z.coerce.number().int().min(1).max(10).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return NextResponse.json({ ok: false, error: "No workspace" }, { status: 400 });

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const aiConfig = getAiConfig();
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
}
