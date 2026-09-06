import { NextResponse } from "next/server";
import { translateText } from "@pushpanel/core";
import { getAiConfig } from "@/lib/secrets";
import { requireAiAccess } from "@/lib/ai-guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(1).max(5000),
  lang: z.string().regex(/^[A-Za-z-]{2,10}$/, "Invalid language"),
});

export async function POST(req: Request) {
  const gate = await requireAiAccess(req);
  if (!gate.ok) return gate.response;
  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const aiConfig = getAiConfig();
  const translated = await translateText(parsed.data.text, parsed.data.lang, {
    apiKey: aiConfig.apiKey,
    model: aiConfig.model,
    baseUrl: aiConfig.baseUrl,
  });
  return NextResponse.json({ ok: true, translated });
}
