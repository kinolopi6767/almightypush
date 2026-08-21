import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { translateText } from "@pushpanel/core";
import { getAiConfig } from "@/lib/secrets";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(1).max(5000),
  lang: z.string().min(2).max(10),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
