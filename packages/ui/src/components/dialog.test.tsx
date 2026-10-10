import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ReadOnlyProvider } from "../lib/read-only";
import { Button } from "./button";
import { Dialog, DialogClose, DialogFooter } from "./dialog";
import { FormDialog } from "./form-dialog";

/** A dialog opened from state the page owns, with no trigger next to it. */
function Controlled() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Tag face
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Identify this face">
        <Button onClick={() => setOpen(false)}>Save</Button>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("is closed until its trigger is clicked, then closes on its × button", async () => {
    render(
      <Dialog
        trigger={<Button>Edit person</Button>}
        title="Edit person"
        description="Names and dates"
      >
        <p>The form</p>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit person" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit person" });
    expect(dialog).toHaveAccessibleDescription("Names and dates");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes from a DialogClose button and on Escape", async () => {
    render(
      <Dialog trigger={<Button>Open</Button>} title="Edit">
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
        </DialogFooter>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("hands the body a close callback", async () => {
    render(
      <Dialog trigger={<Button>Open</Button>} title="Edit">
        {(close) => <Button onClick={close}>Done</Button>}
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("can be controlled with no trigger, and reopens after the caller closes it", async () => {
    render(<Controlled />);
    await userEvent.click(screen.getByRole("button", { name: "Tag face" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Tag face" }));
    expect(await screen.findByRole("dialog", { name: "Identify this face" })).toBeInTheDocument();
  });
});

describe("FormDialog", () => {
  it("opens from its trigger and reports open/close", async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(
      <FormDialog
        trigger={<Button>Add source</Button>}
        title="Add a source"
        onOpenChange={onOpenChange}
      >
        {(close) => <Button onClick={close}>Save</Button>}
      </FormDialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add source" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it("renders nothing for a read-only member", () => {
    render(
      <ReadOnlyProvider>
        <FormDialog trigger={<Button>Add source</Button>} title="Add a source">
          {() => null}
        </FormDialog>
      </ReadOnlyProvider>,
    );
    expect(screen.queryByRole("button", { name: "Add source" })).not.toBeInTheDocument();
  });
});
