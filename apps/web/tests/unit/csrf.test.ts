import { afterEach, describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/csrf";

const APP_URL = process.env.APP_URL;

afterEach(() => {
  if (APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = APP_URL;
});

function req(headers: Record<string, string>): Request {
  return new Request("https://panel.test/api/v1/journeys", { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it("allows requests with no Origin/Referer (non-browser callers)", () => {
    process.env.APP_URL = "https://panel.test";
    expect(isSameOriginRequest(req({}))).toBe(true);
  });

  it("allows matching Origin", () => {
    process.env.APP_URL = "https://panel.test";
    expect(isSameOriginRequest(req({ origin: "https://panel.test" }))).toBe(true);
  });

  it("rejects cross-site Origin", () => {
    process.env.APP_URL = "https://panel.test";
    expect(isSameOriginRequest(req({ origin: "https://evil.test" }))).toBe(false);
  });

  it("rejects malformed Origin", () => {
    process.env.APP_URL = "https://panel.test";
    expect(isSameOriginRequest(req({ origin: "not-a-url" }))).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    process.env.APP_URL = "https://panel.test";
    expect(isSameOriginRequest(req({ referer: "https://panel.test/dashboard" }))).toBe(true);
    expect(isSameOriginRequest(req({ referer: "https://evil.test/x" }))).toBe(false);
  });

  it("rejects sibling subdomains of APP_URL (same-site, not same-origin)", () => {
    process.env.APP_URL = "https://panel.test";
    expect(isSameOriginRequest(req({ origin: "https://evil.panel.test" }))).toBe(false);
    expect(isSameOriginRequest(req({ referer: "https://evil.panel.test/x" }))).toBe(false);
  });

  it("rejects scheme and port mismatches", () => {
    process.env.APP_URL = "https://panel.test";
    expect(isSameOriginRequest(req({ origin: "http://panel.test" }))).toBe(false);
    expect(isSameOriginRequest(req({ origin: "https://panel.test:8443" }))).toBe(false);
  });

  it("allows explicit ports when APP_URL declares one", () => {
    process.env.APP_URL = "http://panel.test:3100";
    expect(isSameOriginRequest(req({ origin: "http://panel.test:3100" }))).toBe(true);
    expect(isSameOriginRequest(req({ origin: "http://panel.test:3101" }))).toBe(false);
  });
});
