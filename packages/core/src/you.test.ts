import { describe, expect, it } from "vitest";
import { readCappedJson, sanitizeYouHits } from "./you";

describe("sanitizeYouHits", () => {
  it("bounds count, text lengths, and list sizes", () => {
    const hits = [
      { title: "t".repeat(500), url: "https://x.test/" + "p".repeat(3000), snippets: ["s".repeat(2000), "ok", 42, null], highlights: ["h".repeat(1500)] },
      { title: "second", url: "https://y.test/" },
    ] as unknown as Parameters<typeof sanitizeYouHits>[0];
    const out = sanitizeYouHits(hits, 1);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toHaveLength(300);
    expect(out[0]!.url).toHaveLength(2048);
    expect(out[0]!.snippets).toHaveLength(2);
    expect(out[0]!.snippets![0]).toHaveLength(1000);
    expect(out[0]!.highlights![0]).toHaveLength(1000);
  });

  it("drops non-string fields instead of crashing", () => {
    const out = sanitizeYouHits([{ title: 42, url: null } as unknown as { title?: string; url?: string }], 5);
    expect(out[0]!.title).toBeUndefined();
    expect(out[0]!.url).toBeUndefined();
  });
});

describe("readCappedJson", () => {
  it("parses a normal JSON body", async () => {
    const data = await readCappedJson<{ a: number }>(new Response(JSON.stringify({ a: 1 }), { headers: { "content-type": "application/json" } }));
    expect(data).toEqual({ a: 1 });
  });

  it("rejects oversized bodies without buffering them whole", async () => {
    const big = "x".repeat(1_000_001);
    await expect(readCappedJson(new Response(`{"a":"${big}"}`))).rejects.toThrow("response too large");
  });

  it("rejects invalid JSON with a generic error (no body echo)", async () => {
    await expect(readCappedJson(new Response("not-json{"))).rejects.toThrow("invalid response");
  });
});
