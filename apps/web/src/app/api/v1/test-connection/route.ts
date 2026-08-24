import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { getAiConfig, getMailConfig, getYouConfig, getGDriveConfig } from "@/lib/secrets";
import { youSearch } from "@pushpanel/core";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  provider: z.enum(["ai", "you", "mail", "drive"]),
});

/**
 * Panel-only connection test for all external APIs.
 * No env edit needed — uses panel secrets (encrypted) with env as fallback.
 * Tests are lightweight: 1 API call with tiny payload, 8s timeout.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid provider" }, { status: 400 });
  }

  try {
    if (parsed.provider === "ai") {
      const { apiKey, model, baseUrl } = getAiConfig();
      if (!apiKey) return NextResponse.json({ ok: false, error: "AI API key not set in panel" }, { status: 400 });
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json({ ok: false, error: `AI API ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
      }
      return NextResponse.json({ ok: true, message: `Connected to ${model}` });
    }

    if (parsed.provider === "you") {
      const { apiKey } = getYouConfig();
      // Free tier search works without key — test with a tiny query
      const hits = await youSearch("test", { count: 1, config: apiKey ? { apiKey } : undefined });
      return NextResponse.json({ ok: true, message: `you.com ${apiKey ? "authenticated" : "free tier"} — ${hits.length} hit(s)` });
    }

    if (parsed.provider === "mail") {
      const { provider, apiKey, from } = getMailConfig();
      if (!apiKey) return NextResponse.json({ ok: false, error: "Mail API key not set" }, { status: 400 });
      if (!from) return NextResponse.json({ ok: false, error: "Mail From not set" }, { status: 400 });
      // Lightweight provider check: validate key format + from domain
      if (provider === "resend") {
        const res = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return NextResponse.json({ ok: false, error: `Resend ${res.status}` }, { status: 502 });
        return NextResponse.json({ ok: true, message: "Resend connected" });
      }
      if (provider === "brevo") {
        const res = await fetch("https://api.brevo.com/v3/senders", {
          headers: { "api-key": apiKey },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return NextResponse.json({ ok: false, error: `Brevo ${res.status}` }, { status: 502 });
        return NextResponse.json({ ok: true, message: "Brevo connected" });
      }
      // SES / SMTP: validate key presence + from format only (no live SMTP connect to avoid side effects)
      return NextResponse.json({ ok: true, message: `${provider} key + from configured (live send tested on campaign)` });
    }

    if (parsed.provider === "drive") {
      const { enabled, serviceJson } = getGDriveConfig();
      if (!enabled) return NextResponse.json({ ok: false, error: "Drive not enabled" }, { status: 400 });
      if (!serviceJson) return NextResponse.json({ ok: false, error: "Service JSON not set" }, { status: 400 });
      const { getGDriveAccessToken } = await import("@pushpanel/core");
      await getGDriveAccessToken(serviceJson);
      return NextResponse.json({ ok: true, message: "Drive service account valid" });
    }

    return NextResponse.json({ ok: false, error: "Unknown provider" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Connection failed";
    return NextResponse.json({ ok: false, error: msg.slice(0, 300) }, { status: 502 });
  }
}
