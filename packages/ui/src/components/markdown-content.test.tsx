import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "./markdown-content";

describe("MarkdownContent", () => {
  it("renders markdown formatting as real elements, not literal syntax", () => {
    render(
      <MarkdownContent>
        {"# Heading\n\n**bold** and *italic*, plus a list:\n\n- one\n- two"}
      </MarkdownContent>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Heading" })).toBeVisible();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByRole("list")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders a link with its href", () => {
    render(<MarkdownContent>{"See [the source](https://example.com)."}</MarkdownContent>);
    expect(screen.getByRole("link", { name: "the source" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });
});
