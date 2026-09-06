import { describe, expect, it } from "vitest";
import { renderBlocksToHtml } from "./email";

describe("renderBlocksToHtml", () => {
  it("renders text and divider blocks without URLs", () => {
    const html = renderBlocksToHtml([
      { type: "text", content: "Hello" },
      { type: "divider" },
    ]);
    expect(html).toContain("Hello");
    expect(html).toContain("<hr");
  });

  it("renders social blocks as centered text", () => {
    const html = renderBlocksToHtml([{ type: "social", content: "Follow us" }]);
    expect(html).toContain("Follow us");
  });

  it("blocks javascript: URLs in href/src", () => {
    const html = renderBlocksToHtml([
      { type: "button", content: "Click", url: "javascript:alert(1)" },
      { type: "hero", url: "data:text/html,<h1>x</h1>" },
    ]);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text");
  });

  it("links product blocks when the URL is safe", () => {
    const html = renderBlocksToHtml([{ type: "product", content: "Shoes", url: "https://shop.example/p/1" }]);
    expect(html).toContain("https://shop.example/p/1");
    expect(html).toContain("Shoes");
  });
});
