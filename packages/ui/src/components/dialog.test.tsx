import { User } from "@react-aria/test-utils";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

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
});
