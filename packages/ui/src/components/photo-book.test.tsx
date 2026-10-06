import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { PhotoBook, type PhotoBookPage } from "./photo-book";

const PAGES: PhotoBookPage[] = [
  { id: "page-1", photos: [{ id: "p1", src: "/p1.jpg", alt: "Photo 1" }] },
  { id: "page-2", photos: [{ id: "p2", src: "/p2.jpg", alt: "Photo 2" }] },
];

/** Not built on a `DialogTrigger` (see photo-book.tsx's own comment, matching `ImageViewer`) — plain render/userEvent covers open/closed state and page-turning just as well. */
function ControlledBook() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open book
      </button>
      <PhotoBook
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Sample album"
        coverNode={<div>Cover</div>}
        insideCoverNode={<div>Inside cover</div>}
        pages={PAGES}
        paperStyle="black"
      />
    </>
  );
}

describe("PhotoBook", () => {
  it("is closed until opened, then closes on its own close button", async () => {
    render(<ControlledBook />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open book" }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByText("Sample album")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("starts closed (prev disabled) and turns pages forward/back via the buttons", async () => {
    render(<ControlledBook />);
    await userEvent.click(screen.getByRole("button", { name: "Open book" }));
    await screen.findByRole("dialog");

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    // `waitFor`, not a synchronous check — `findByRole("dialog")` only waits
    // for the dialog element to exist, not for Motion's enter animation
    // (`requestAnimationFrame`-driven) to finish committing `opacity: 1` on
    // it; see dialog.test.tsx's matching fix for the same race.
    await waitFor(() => expect(screen.getByText("Closed")).toBeVisible());

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Turned 1 of 2")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("Closed")).toBeVisible();
  });

  it("turns pages with the arrow keys", async () => {
    render(<ControlledBook />);
    await userEvent.click(screen.getByRole("button", { name: "Open book" }));
    await screen.findByRole("dialog");

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Turned 1 of 2")).toBeVisible();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("End of album")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Turned 1 of 2")).toBeVisible();
  });
});
