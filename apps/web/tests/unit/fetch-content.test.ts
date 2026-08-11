import { describe, expect, it } from "vitest";
import { extractOpenGraph } from "@/lib/fetch-content";

describe("B2 og-scrape extraction", () => {
  it("picks og:title, og:description and og:image", () => {
    const html = `
      <html><head>
        <title>Fallback title</title>
        <meta property="og:title" content="Actual title" />
        <meta property="og:description" content="The description" />
        <meta property="og:image" content="https://cdn.example.com/img.png" />
      </head></html>`;
    expect(extractOpenGraph(html)).toEqual({
      title: "Actual title",
      description: "The description",
      image: "https://cdn.example.com/img.png",
    });
  });

  it("falls back to <title> and meta description", () => {
    const html = `<html><head><title>Page title</title><meta name="description" content="desc"></head></html>`;
    expect(extractOpenGraph(html)).toEqual({ title: "Page title", description: "desc", image: undefined });
  });

  it("returns empty fields when nothing is present", () => {
    expect(extractOpenGraph("<html></html>")).toEqual({ title: undefined, description: undefined, image: undefined });
  });

  it("handles single-quoted attributes", () => {
    const html = `<meta property='og:title' content='Quoted title' />`;
    expect(extractOpenGraph(html).title).toBe("Quoted title");
  });
});