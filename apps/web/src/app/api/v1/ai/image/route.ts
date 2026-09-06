import { NextResponse } from "next/server";
import { requireAiAccess } from "@/lib/ai-guard";
import { db } from "@/lib/db";
import { aiGenerations } from "@pushpanel/db/schema";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  width: z.coerce.number().int().min(16).max(2048).optional(),
  height: z.coerce.number().int().min(16).max(2048).optional(),
});

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * POST /api/v1/ai/image — deterministic local placeholder image.
 *
 * The panel advertises this endpoint but no route existed (404). There is no
 * image-generation provider configured, so this returns a deterministic SVG
 * data-URL derived from the prompt (hue-rotated gradient + prompt text) plus
 * a picsum.photos fallback URL. When an image provider is added later, swap
 * the body of this handler — the contract (prompt → {image, url}) stays.
 */
export async function POST(req: Request) {
  const gate = await requireAiAccess(req, { limit: 20 });
  if (!gate.ok) return gate.response;
  const wsId = gate.session.user.workspaceId ? Number(gate.session.user.workspaceId) : null;
  if (!wsId) return NextResponse.json({ ok: false, error: "No workspace" }, { status: 400 });

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const { prompt } = parsed.data;
  const width = parsed.data.width ?? 1200;
  const height = parsed.data.height ?? 630;
  const hue = hashHue(prompt);
  const short = prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},60%,32%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},65%,18%)"/>` +
    `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>` +
    `<text x="50%" y="50%" fill="rgba(255,255,255,.92)" font-family="system-ui,sans-serif" font-size="42" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(short)}</text>` +
    `</svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  const fallback = `https://picsum.photos/seed/${encodeURIComponent(prompt.slice(0, 40))}/${width}/${height}`;

  db.insert(aiGenerations)
    .values({ workspace_id: wsId, kind: "image", prompt, output_json: JSON.stringify({ width, height }), model: "placeholder-v1" })
    .run();

  return NextResponse.json({ ok: true, image: dataUrl, url: fallback, width, height, model: "placeholder-v1" });
}
