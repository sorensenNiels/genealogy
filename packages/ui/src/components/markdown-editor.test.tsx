import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MarkdownEditor } from "./markdown-editor";

function ControlledEditor({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MarkdownEditor aria-label="Notes" value={value} onChange={setValue} />;
}

describe("MarkdownEditor", () => {
  // Lexical's contentEditable handling relies on real browser Selection/Range/
  // beforeinput behavior that jsdom doesn't implement, so simulating actual
  // typing here would test jsdom's limitations, not this component — this
  // checks the markdown-in and toolbar-plugin wiring instead, which is what
  // this component is actually responsible for getting right.
  it("shows the initial markdown content once mounted, parsed rather than literal", async () => {
    render(<ControlledEditor initial="Hello **world**" />);
    await waitFor(() => expect(screen.getByText("world")).toBeVisible());
    expect(screen.getByText("world").tagName).toBe("STRONG");
  });

  it("renders the basic formatting toolbar", async () => {
    render(<ControlledEditor />);
    // Radix Toolbar mixes roles across item kinds (`radio` for the
    // Bold/Italic toggle group, `button` for one-shot actions), so this
    // matches on the accessible name via aria-label rather than a role.
    expect(await screen.findByLabelText("Bold")).toBeVisible();
    expect(screen.getByLabelText("Italic")).toBeVisible();
    expect(screen.getByLabelText("Bulleted list")).toBeVisible();
    expect(screen.getByLabelText("Create link")).toBeVisible();
  });

  // Regression check: MDXEditor ships its own light/dark stylesheet, active
  // only when it's told to via its own "dark-theme" class — it does not pick
  // this up from an ancestor's unrelated `.dark` class the way the rest of
  // this app's dark mode works. Without wiring this explicitly, the editor
  // silently stays in its light palette, which (depending on what sits
  // behind it) can mean unreadable text against this app's dark background.
  describe("dark mode", () => {
    beforeEach(() => localStorage.setItem("genealogy-theme", "dark"));
    afterEach(() => localStorage.removeItem("genealogy-theme"));

    it("switches MDXEditor to its own dark-theme class when the app is in dark mode", async () => {
      const { container } = render(<ControlledEditor />);
      await waitFor(() => expect(container.querySelector(".dark-theme")).not.toBeNull());
    });
  });
});
