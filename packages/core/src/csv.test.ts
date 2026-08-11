import { describe, expect, it } from "vitest";
import { csvCell, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple unquoted rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas and quotes inside quoted cells", () => {
    const csv = '"hello, world","say ""hi""",plain';
    expect(parseCsv(csv)).toEqual([['hello, world', 'say "hi"', "plain"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips a leading BOM", () => {
    expect(parseCsv("\uFEFFa,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps blank lines as empty rows and drops trailing content correctly", () => {
    expect(parseCsv("a\n\nb")).toEqual([["a"], [""], ["b"]]);
  });

  it("round-trips a realistic subscriber export", () => {
    const row1 = ["42", 'https://push.example.test/abc', "p256dh-key==", "auth-key==", 'a "quoted" browser', "commas, and , more"];
    const csv = [row1.map((c) => csvCell(c)).join(",")].join("\n");
    expect(parseCsv(csv)).toEqual([row1]);
  });

  it("handles a trailing comma and empty cells", () => {
    expect(parseCsv("a,,c\n")).toEqual([["a", "", "c"]]);
  });
});
import { campaignAnalyticsCsv } from "./csv";

describe("campaignAnalyticsCsv", () => {
  const row = {
    id: 7,
    title: 'Sale "now", 50% off',
    domain: "shop.example.com",
    status: "sending",
    sent_at: "2026-01-02T09:00:00.000Z",
    delivered: 100,
    failed: 2,
    clicked: 25,
    buttons: ["Buy", "Later"],
    per_button: { Buy: 20, Later: 5 },
  };

  it("emits a header row and one line per campaign", () => {
    const parsed = parseCsv(campaignAnalyticsCsv([row]));
    expect(parsed[0]).toEqual(["id", "title", "domain", "status", "sent_at", "delivered", "failed", "clicked", "click_rate_pct", "buttons", "clicks_per_button"]);
    expect(parsed[1][0]).toBe("7");
    expect(parsed[1][1]).toBe('Sale "now", 50% off');
    expect(parsed[1][8]).toBe("25.00"); // 25/100 clip rate
    expect(parsed[1][9]).toBe("Buy | Later");
    expect(parsed[1][10]).toBe('{"Buy":20,"Later":5}');
  });

  it("round-trips through parseCsv", () => {
    const parsed = parseCsv(campaignAnalyticsCsv([row]));
    expect(parsed[0]).toEqual(["id", "title", "domain", "status", "sent_at", "delivered", "failed", "clicked", "click_rate_pct", "buttons", "clicks_per_button"]);
    expect(parsed[1][1]).toBe('Sale "now", 50% off');
    expect(parsed[1][8]).toBe("25.00");
  });

  it("handles an empty export with headers only", () => {
    expect(campaignAnalyticsCsv([]).trim().split("\r\n")).toHaveLength(1);
  });

  it("leaves rate blank when nothing was delivered", () => {
    const parsed = parseCsv(campaignAnalyticsCsv([{ ...row, delivered: 0, clicked: 0 }]));
    expect(parsed[1][8]).toBe("");
  });
});
