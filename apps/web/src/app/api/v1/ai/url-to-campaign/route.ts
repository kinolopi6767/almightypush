import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertPublicHttpUrl } from "@pushpanel/core";
import { extractOpenGraph } from "@/lib/fetch-content";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().url() });

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
  const check = await assertPublicHttpUrl(parsed.data.url);
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
  try {
    const res = await fetch(check.url!.toString(), { headers: { accept: "text/html", "user-agent": "PushPanelBot/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ ok: false, error: `Page returned ${res.status}` }, { status: 502 });
    const html = await res.text();
    const og = extractOpenGraph(html);
    return NextResponse.json({ ok: true, title: og.title, description: og.description, image: og.image, url: parsed.data.url });
  } catch {
    return NextResponse.json({ ok: false, error: "Fetch failed" }, { status: 502 });
  }
}
