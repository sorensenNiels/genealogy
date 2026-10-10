import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ImageViewer } from "./image-viewer";

function ControlledViewer({
  onPrevious,
  onNext,
}: {
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open viewer
      </button>
      <ImageViewer
        open={isOpen}
        onOpenChange={setIsOpen}
        title="A photo"
        {...(onPrevious ? { onPrevious } : {})}
        {...(onNext ? { onNext } : {})}
      >
        <img src="/photo.jpg" alt="A family portrait" />
      </ImageViewer>
    </>
  );
}

describe("ImageViewer", () => {
  it("is closed until opened, then closes on its own close button", async () => {
    render(<ControlledViewer />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open viewer" }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByText("A photo")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("omits the previous/next controls when their handlers aren't given", async () => {
    render(<ControlledViewer />);
    await userEvent.click(screen.getByRole("button", { name: "Open viewer" }));
    await screen.findByRole("dialog");

    expect(screen.queryByRole("button", { name: "Previous photo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next photo" })).not.toBeInTheDocument();
  });

  it("calls onPrevious/onNext when those controls are pressed", async () => {
    const onPrevious = vi.fn<() => void>();
    const onNext = vi.fn<() => void>();
    render(<ControlledViewer onPrevious={onPrevious} onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Open viewer" }));
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(onNext).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(onPrevious).toHaveBeenCalledOnce();
  });
});
