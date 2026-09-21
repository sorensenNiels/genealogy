import { User } from "@react-aria/test-utils";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";

const testUtilUser = new User({ interactionType: "mouse" });

function ExampleAlertDialog({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <Button variant="destructive">Delete…</Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this record?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onPress={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog", () => {
  it("is closed until opened, and Cancel dismisses without confirming", async () => {
    const onConfirm = vi.fn<() => void>();
    render(<ExampleAlertDialog onConfirm={onConfirm} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    const tester = testUtilUser.createTester("Dialog", {
      root: screen.getByRole("button", { name: "Delete…" }),
      overlayType: "modal",
    });

    await tester.open();
    const dialog = tester.getDialog();
    expect(dialog).toBeVisible();
    expect(screen.getByText("Delete this record?")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the action and closes when confirmed", async () => {
    const onConfirm = vi.fn<() => void>();
    render(<ExampleAlertDialog onConfirm={onConfirm} />);

    const tester = testUtilUser.createTester("Dialog", {
      root: screen.getByRole("button", { name: "Delete…" }),
      overlayType: "modal",
    });

    await tester.open();
    const dialog = tester.getDialog();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not close on Escape or an outside click", async () => {
    const onConfirm = vi.fn<() => void>();
    render(<ExampleAlertDialog onConfirm={onConfirm} />);

    const tester = testUtilUser.createTester("Dialog", {
      root: screen.getByRole("button", { name: "Delete…" }),
      overlayType: "modal",
    });

    await tester.open();
    const dialog = tester.getDialog();

    await userEvent.keyboard("[Escape]");
    expect(dialog).toBeVisible();

    await userEvent.click(document.body);
    expect(dialog).toBeVisible();
  });
});
