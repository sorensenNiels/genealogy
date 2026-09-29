import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FaceBoxOverlay, type FaceBox } from "./face-box-overlay";

const BOXES: FaceBox[] = [
  { id: "a", left: 0.1, top: 0.1, width: 0.2, height: 0.2, label: "Jane Doe", state: "linked" },
  { id: "b", left: 0.5, top: 0.5, width: 0.2, height: 0.2, state: "untagged" },
];

describe("FaceBoxOverlay", () => {
  it("renders a clickable box per face, calling onBoxPress with its id", async () => {
    const onBoxPress = vi.fn<(boxId: string) => void>();
    render(<FaceBoxOverlay src="/photo.jpg" alt="A photo" boxes={BOXES} onBoxPress={onBoxPress} />);

    expect(screen.getByRole("img", { name: "A photo" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Jane Doe" }));
    expect(onBoxPress).toHaveBeenCalledWith("a");

    await userEvent.click(screen.getByRole("button", { name: "Detected face" }));
    expect(onBoxPress).toHaveBeenCalledWith("b");
  });

  it("hides every box when showBoxes is false, without unmounting the image", () => {
    render(<FaceBoxOverlay src="/photo.jpg" alt="A photo" boxes={BOXES} showBoxes={false} />);

    expect(screen.getByRole("img", { name: "A photo" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Jane Doe" })).not.toBeInTheDocument();
  });

  it("shows an unlink button only for a linked box, calling onUnlinkPress without triggering onBoxPress", async () => {
    const onBoxPress = vi.fn<(boxId: string) => void>();
    const onUnlinkPress = vi.fn<(boxId: string) => void>();
    render(
      <FaceBoxOverlay
        src="/photo.jpg"
        alt="A photo"
        boxes={BOXES}
        onBoxPress={onBoxPress}
        onUnlinkPress={onUnlinkPress}
      />,
    );

    expect(screen.queryByRole("button", { name: "Unlink Detected face" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unlink Jane Doe" }));
    expect(onUnlinkPress).toHaveBeenCalledWith("a");
    expect(onBoxPress).not.toHaveBeenCalled();
  });
});
