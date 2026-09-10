import { describe, expect, it } from "vitest";
import { readJsonResult, readTextCapped, BodyTooLargeError } from "@/lib/read-body";

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request("http://panel.test/api", { method: "POST", body, headers });
}

describe("readJsonResult", () => {
  it("parses a valid JSON body", async () => {
    const result = await readJsonResult<{ a: number }>(post(JSON.stringify({ a: 1 })), 1024);
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("rejects invalid JSON with 400", async () => {
    const result = await readJsonResult(post("not json"), 1024);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects empty bodies with 400", async () => {
    const result = await readJsonResult(post(null), 1024);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a declared Content-Length over the cap without reading", async () => {
    const result = await readJsonResult(post("{}", { "content-length": "999999" }), 100);
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it("enforces the cap on the stream (chunked bodies have no length)", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new TextEncoder().encode("x".repeat(64)));
        controller.close();
      },
    });
    const req = new Request("http://panel.test/api", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    const result = await readJsonResult(req, 100);
    expect(result).toMatchObject({ ok: false, status: 413 });
  });
});

describe("readTextCapped", () => {
  it("returns text under the cap", async () => {
    await expect(readTextCapped(post("hello"), 100)).resolves.toBe("hello");
  });

  it("throws BodyTooLargeError over the cap", async () => {
    await expect(readTextCapped(post("x".repeat(101)), 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
