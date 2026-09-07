import { describe, expect, it } from "vitest";
import { isNonRoutableHost, parseHostHeader, requestOriginAllowed } from "@/lib/subscribe-origin";

function req(headers: Record<string, string>): Request {
  return new Request("https://panel.example.com/api/v1/subscribe", { method: "POST", headers });
}

describe("isNonRoutableHost", () => {
  it.each(["localhost", "127.0.0.1", "127.0.0.5", "::1", "10.0.0.1", "172.16.0.9", "172.31.255.1", "192.168.1.5", "169.254.169.254", "fc00::1", "fd12::99", "fe80::1", "fe90::1", "febf::99"])(
    "treats %s as non-routable",
    (h) => expect(isNonRoutableHost(h)).toBe(true),
  );
  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "203.0.113.7", "example.com", "evil.com", "foo.local", "2001:db8::1"])(
    "treats %s as routable",
    (h) => expect(isNonRoutableHost(h)).toBe(false),
  );
});

describe("parseHostHeader", () => {
  it("strips ports and IPv6 brackets", () => {
    expect(parseHostHeader("example.com:3000")).toBe("example.com");
    expect(parseHostHeader("[::1]:3000")).toBe("::1");
    expect(parseHostHeader("[::1]")).toBe("::1");
    expect(parseHostHeader("127.0.0.1:3100")).toBe("127.0.0.1");
    expect(parseHostHeader(null)).toBeNull();
    expect(parseHostHeader("  ")).toBeNull();
  });
});

describe("requestOriginAllowed", () => {
  const domain = "example.com";

  it("allows the domain and its subdomains", () => {
    expect(requestOriginAllowed(req({ origin: "https://example.com" }), "", domain)).toBe(true);
    expect(requestOriginAllowed(req({ origin: "https://blog.example.com" }), "", domain)).toBe(true);
  });

  it("rejects foreign origins even when Host matches them (DNS-pointed site)", () => {
    // Attacker points evil.com at the panel: Host == Origin == evil.com.
    // A public Host must not vouch for someone else's domain.
    expect(
      requestOriginAllowed(req({ origin: "https://evil.com", host: "evil.com" }), "", domain),
    ).toBe(false);
  });

  it("rejects lookalike suffixes", () => {
    expect(requestOriginAllowed(req({ origin: "https://notexample.com" }), "", domain)).toBe(false);
    expect(requestOriginAllowed(req({ origin: "https://example.com.evil.com" }), "", domain)).toBe(false);
  });

  it("allows loopback Host for the local sandbox demo", () => {
    expect(
      requestOriginAllowed(req({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }), "", domain),
    ).toBe(true);
    expect(
      requestOriginAllowed(req({ origin: "http://192.168.1.5:3000", host: "192.168.1.5:3000" }), "", domain),
    ).toBe(true);
  });

  it("falls back to subscribeUrl when Origin is absent", () => {
    expect(requestOriginAllowed(req({ host: "panel.example.com" }), "https://example.com/page", domain)).toBe(true);
    expect(requestOriginAllowed(req({ host: "panel.example.com" }), "https://evil.com/page", domain)).toBe(false);
    expect(requestOriginAllowed(req({ host: "panel.example.com" }), "", domain)).toBe(false);
    // Attacker-controlled Host alone vouches for nothing without Origin.
    expect(requestOriginAllowed(req({ host: "evil.com" }), "", domain)).toBe(false);
  });

  it("rejects malformed origins and urls", () => {
    expect(requestOriginAllowed(req({ origin: "not-a-url" }), "", domain)).toBe(false);
    expect(requestOriginAllowed(req({ host: "x" }), "not-a-url", domain)).toBe(false);
  });
});
