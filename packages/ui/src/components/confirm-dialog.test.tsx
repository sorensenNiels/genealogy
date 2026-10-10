import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";
import { RemoveButton } from "./remove-button";

function Example({ onConfirm }: { onConfirm: () => void }) {
  return (
    <ConfirmDialog
      trigger={<Button>Delete person</Button>}
      title="Delete Karen Hansdatter?"
      description="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
    />
  );
}

describe("ConfirmDialog", () => {
  it("is closed until opened, and Cancel dismisses without confirming", async () => {
    const onConfirm = vi.fn<() => void>();
    render(<Example onConfirm={onConfirm} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete person" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Delete Karen Hansdatter?" }),
    ).toHaveAccessibleDescription("This cannot be undone.");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs onConfirm and closes when confirmed", async () => {
    const onConfirm = vi.fn<() => void>();
    render(<Example onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete person" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("isn't dismissed by a click outside", async () => {
    render(<Example onConfirm={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete person" }));
    await screen.findByRole("alertdialog");
    await userEvent.click(document.body);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("RemoveButton", () => {
  it("asks before removing, with the item in the title", async () => {
    const onConfirm = vi.fn<() => void>();
    render(<RemoveButton itemLabel="this citation" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Remove this citation?" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" }).at(-1)!);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
