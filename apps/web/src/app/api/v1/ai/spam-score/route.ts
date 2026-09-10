import { NextResponse } from "next/server";
import { requireAiAccess } from "@/lib/ai-guard";
import { checkSpamScore } from "@pushpanel/core";
import { z } from "zod";
import { readJsonResult, BODY_LIMITS } from "@/lib/read-body";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  const gate = await requireAiAccess(req);
  if (!gate.ok) return gate.response;
  const rawBody = await readJsonResult(req, BODY_LIMITS.api);
  if (!rawBody.ok) return NextResponse.json({ ok: false, error: rawBody.error }, { status: rawBody.status });
  const parsed = bodySchema.safeParse(rawBody.data);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const result = checkSpamScore(parsed.data.title, parsed.data.body);
  return NextResponse.json({ ok: true, ...result });
}
