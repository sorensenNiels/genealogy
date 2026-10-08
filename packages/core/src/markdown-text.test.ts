import { describe, expect, it } from "vitest";

import { markdownToPlainText } from "./markdown-text.js";

describe("markdownToPlainText", () => {
  it("leaves plain text untouched", () => {
    expect(markdownToPlainText("Born on the farm Østergaard.\nBaptised a week later.")).toBe(
      "Born on the farm Østergaard.\nBaptised a week later.",
    );
  });

  it("drops heading, emphasis and quote markup but keeps the words", () => {
    expect(
      markdownToPlainText("# Census 1801\n\n**Head** of household, *farmer*.\n\n> Quoted text"),
    ).toBe("Census 1801\n\nHead of household, farmer.\n\nQuoted text");
  });

  it("keeps a link's address unless it is the link text", () => {
    expect(markdownToPlainText("See [the church book](https://example.org/kb/12).")).toBe(
      "See the church book (https://example.org/kb/12).",
    );
    expect(markdownToPlainText("[https://example.org](https://example.org)")).toBe(
      "https://example.org",
    );
  });

  it("normalizes list bullets and keeps numbered lists", () => {
    expect(markdownToPlainText("* one\n+ two\n- three\n1. first")).toBe(
      "- one\n- two\n- three\n1. first",
    );
  });

  it("unescapes MDXEditor's backslash escapes and leaves snake_case and arithmetic alone", () => {
    expect(markdownToPlainText("Farm no\\. 3\\_a, file_name, 2 \\* 3 = 6")).toBe(
      "Farm no. 3_a, file_name, 2 * 3 = 6",
    );
  });

  it("keeps code content and drops fences and rules", () => {
    expect(markdownToPlainText("Before\n\n---\n\n```\nraw text\n```\n`inline`")).toBe(
      "Before\n\nraw text\ninline",
    );
  });
});
