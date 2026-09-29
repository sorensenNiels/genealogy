import { User } from "@react-aria/test-utils";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import {
  ControlledDialogContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

const testUtilUser = new User({ interactionType: "mouse" });

function ExampleDialog() {
  return (
    <Dialog>
      <Button>Open dialog</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Example dialog</DialogTitle>
        </DialogHeader>
        <p>Body content.</p>
        <DialogFooter>
          <Button slot="close">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("is closed until opened, then opens and closes cleanly", async () => {
    render(<ExampleDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const tester = testUtilUser.createTester("Dialog", {
      root: screen.getByRole("button", { name: "Open dialog" }),
      overlayType: "modal",
    });

    await tester.open();
    const dialog = tester.getDialog();
    expect(dialog).toBeVisible();
    expect(screen.getByText("Example dialog")).toBeVisible();

    await tester.close();
    expect(dialog).not.toBeInTheDocument();
  });

  it('closes when a slot="close" button inside it is pressed', async () => {
    render(<ExampleDialog />);
    const tester = testUtilUser.createTester("Dialog", {
      root: screen.getByRole("button", { name: "Open dialog" }),
      overlayType: "modal",
    });

    await tester.open();
    const dialog = tester.getDialog();
    // Two buttons share the accessible name "Close": the footer button and
    // the top-right icon button — either closes the dialog, so use the first.
    await userEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  // A controlled dialog that closes itself (NameForm's onDone does exactly
  // this after a successful save) still renders visibly on the next open —
  // see use-overlay-transition.test.ts for the state-machine-level
  // regression check. jsdom's Motion doesn't reproduce the actual failure
  // (checked directly: this passed even against the un-fixed hook, since
  // React Aria's own Modal here unmounts on the real `isOpen` context
  // regardless of our animation prop), so this is a basic sanity check, not
  // the real coverage for that bug.
  it("opens again after being closed by the caller's own setState, not onOpenChange", async () => {
    render(<ControlledDialog />);
    const openButton = screen.getByRole("button", { name: "Open dialog" });

    await userEvent.click(openButton);
    expect(screen.getByText("Example dialog")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByText("Example dialog")).not.toBeInTheDocument());

    await userEvent.click(openButton);
    await waitFor(() => expect(screen.getByText("Example dialog")).toBeVisible());
  });
});

function ControlledDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog isOpen={open} onOpenChange={setOpen}>
      <Button onPress={() => setOpen(true)}>Open dialog</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Example dialog</DialogTitle>
        </DialogHeader>
        {/* Mirrors NameForm's onDone: closes by calling the setState setter
            directly, as if a save had just succeeded, instead of dismissing
            through React Aria's own trigger/Escape/backdrop path. */}
        <Button onPress={() => setOpen(false)}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

function HeadlessControlledDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open from elsewhere
      </button>
      <ControlledDialogContent isOpen={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogTitle>Headless dialog</DialogTitle>
        </DialogHeader>
      </ControlledDialogContent>
    </>
  );
}

describe("ControlledDialogContent", () => {
  it("has no adjacent trigger button, yet still opens and closes via isOpen/onOpenChange", async () => {
    render(<HeadlessControlledDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open from elsewhere" }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByText("Headless dialog")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });
});
