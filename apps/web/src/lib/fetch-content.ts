/** B2: regex-based og: + <title> extraction (no DOM needed for the meta block). */
export function extractOpenGraph(html: string): { title?: string; description?: string; image?: string } {
  // OG tags live in <head>; scanning a bounded prefix + capping per-tag length
  // keeps the attribute regexes linear even on hostile multi-MB bodies
  // (thousands of unclosed `x="` prefixes would otherwise stall the loop).
  const head = html.slice(0, 131_072);
  const getMetaContent = (name: string): string | undefined => {
    // Find all meta tags, then check attributes irrespective of order.
    const metaTags = head.matchAll(/<meta\b[^>]{0,2000}>/gi);
    const target = name.toLowerCase();
    for (const m of metaTags) {
      const tag = m[0];
      const attrs: Record<string, string> = {};
      for (const m2 of tag.matchAll(/(\w+:?\w*)\s*=\s*(["'])(.*?)\2/g)) {
        const k = m2[1];
        const v = m2[3];
        if (!k || v === undefined) continue;
        attrs[k.toLowerCase()] = v;
      }
      const prop = (attrs.property ?? attrs.name ?? "").toLowerCase();
      if (prop === target) {
        const content = attrs.content?.trim();
        if (content) return content;
      }
    }
    return undefined;
  };
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = getMetaContent("og:title") ?? titleMatch?.[1]?.trim() ?? undefined;
  return {
    title,
    description: getMetaContent("og:description") ?? getMetaContent("description"),
    image: getMetaContent("og:image"),
  };
}