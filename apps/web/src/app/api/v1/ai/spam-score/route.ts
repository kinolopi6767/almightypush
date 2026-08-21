import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkSpamScore } from "@pushpanel/core";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
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
  const result = checkSpamScore(parsed.data.title, parsed.data.body);
  return NextResponse.json({ ok: true, ...result });
}
