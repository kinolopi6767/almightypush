import { z } from "zod";

export const emailBlockSchema = z.object({
  type: z.enum(["hero", "text", "button", "divider", "social", "product"]),
  content: z.string().optional(),
  url: z.string().url().optional(),
  style: z.record(z.string()).optional(),
});
export type EmailBlock = z.infer<typeof emailBlockSchema>;

export const emailCampaignSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  preheader: z.string().trim().max(200).optional().or(z.literal("")),
  html: z.string().max(500_000).optional().or(z.literal("")),
  blocks_json: z.string().optional().or(z.literal("")),
  from_email: z.string().email().optional().or(z.literal("")),
  audience_json: z.string().optional(),
  schedule_at: z.string().optional().or(z.literal("")),
});
export type EmailCampaignInput = z.infer<typeof emailCampaignSchema>;

/** Very small MJML-like render: blocks → HTML */
export function renderBlocksToHtml(blocks: EmailBlock[]): string {
  const parts: string[] = ['<div style="font-family:system-ui;max-width:600px;margin:0 auto">'];
  for (const b of blocks) {
    // Scheme allowlist: zod's .url() accepts javascript:/data: — those must
    // never reach href/src, even in owner-authored content (stored-XSS
    // latency when a real send path or preview lands).
    if (!isSafeEmailUrl(b.url)) continue;
    if (b.type === "hero" && b.url) parts.push(`<img src="${escapeHtml(b.url)}" style="width:100%;border-radius:8px" />`);
    else if (b.type === "text") parts.push(`<p>${escapeHtml(b.content ?? "")}</p>`);
    else if (b.type === "button" && b.content && b.url) parts.push(`<a href="${escapeHtml(b.url)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(b.content)}</a>`);
    else if (b.type === "divider") parts.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />`);
    else if (b.type === "product" && b.content) parts.push(`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px">${escapeHtml(b.content)}</div>`);
  }
  parts.push("</div>");
  return parts.join("\n");
}

function isSafeEmailUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:";
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** SPF/DKIM simple check */
export function isValidDomain(domain: string): boolean {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}
