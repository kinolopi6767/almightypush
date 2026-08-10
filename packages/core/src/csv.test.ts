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