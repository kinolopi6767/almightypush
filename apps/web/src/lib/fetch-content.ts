/** B2: regex-based og: + <title> extraction (no DOM needed for the meta block). */
export function extractOpenGraph(html: string): { title?: string; description?: string; image?: string } {
  const meta = (name: string): string | undefined => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
    const match = html.match(re);
    if (!match) return undefined;
    const content = match[0].match(/content=["']([^"']*)["']/i);
    return content?.[1]?.trim() || undefined;
  };
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = meta("og:title") ?? titleMatch?.[1]?.trim() ?? undefined;
  return {
    title,
    description: meta("og:description") ?? meta("description"),
    image: meta("og:image"),
  };
}