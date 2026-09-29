import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FileDropZone } from "./file-drop-zone";

// Drag-and-drop itself relies on native DragEvent/DataTransfer plumbing that
// jsdom doesn't implement — these tests cover the click-to-pick path
// (FileTrigger's hidden <input type="file">), which exercises the same
// `onFilesSelected`/`maxBytes` logic either way.
function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("No file input rendered");
  return input as HTMLInputElement;
}

describe("FileDropZone", () => {
  it("calls onFilesSelected with every file chosen via the browse button", async () => {
    const onFilesSelected = vi.fn<(files: File[]) => void>();
    const { container } = render(<FileDropZone onFilesSelected={onFilesSelected} />);

    const file = new File(["hello"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(fileInput(container), file);

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it("drops files larger than maxBytes rather than passing them through", async () => {
    const onFilesSelected = vi.fn<(files: File[]) => void>();
    const { container } = render(<FileDropZone onFilesSelected={onFilesSelected} maxBytes={3} />);

    const tooBig = new File(["way too large"], "big.jpg", { type: "image/jpeg" });
    await userEvent.upload(fileInput(container), tooBig);

    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it("shows the browse trigger as a labelled button", () => {
    render(<FileDropZone onFilesSelected={vi.fn<(files: File[]) => void>()} />);
    expect(screen.getByRole("button", { name: "browse" })).toBeVisible();
  });
});
