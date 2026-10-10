import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ImageCropDialog } from "./image-crop-dialog";

/**
 * `react-easy-crop`'s own drag/zoom/pinch gesture mechanics need real layout
 * (image dimensions, pointer events) jsdom can't provide, so this doesn't
 * try to simulate an actual crop drag — same reasoning `image-viewer.test.tsx`
 * gives for testing the controlled open/close contract directly rather than
 * a `DialogTrigger`-shaped interaction. What's covered: the dialog opens and
 * closes, "Back" is only shown when given, and "Use this photo" starts
 * disabled — before any `onCropComplete` fires (which the underlying
 * Cropper only does once it has real measured layout), there's nothing to
 * confirm yet.
 */
function ControlledCropDialog({ onBack, isSaving }: { onBack?: () => void; isSaving?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open cropper
      </button>
      <ImageCropDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        imageSrc="/photo.jpg"
        onCropped={() => {}}
        {...(onBack ? { onBack } : {})}
        {...(isSaving !== undefined ? { isSaving } : {})}
      />
    </>
  );
}

describe("ImageCropDialog", () => {
  it("is closed until opened, then closes on its own close button", async () => {
    render(<ControlledCropDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open cropper" }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByText("Choose a photo")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("omits the Back button when onBack isn't given, and calls it when it is", async () => {
    const onBack = vi.fn<() => void>();
    const { rerender } = render(<ControlledCropDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Open cropper" }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();

    rerender(<ControlledCropDialog onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('starts with "Use this photo" disabled, before any crop has completed', async () => {
    render(<ControlledCropDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Open cropper" }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Use this photo" })).toBeDisabled();
  });
});
