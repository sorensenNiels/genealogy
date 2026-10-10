import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlusIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { DropdownMenu, DropdownMenuItem } from "./dropdown-menu";
import { FormDialog } from "./form-dialog";
import { IconButton } from "./icon-button";

describe("IconButton", () => {
  it("is named by its label and shows it as a tooltip on hover", async () => {
    const onClick = vi.fn<() => void>();
    render(<IconButton label="Add parent" icon={<PlusIcon />} onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Add parent" });
    await userEvent.hover(button);
    expect(
      await screen.findByText("Add parent", {
        selector: "[data-slot=tooltip-content] *, [data-slot=tooltip-content]",
      }),
    ).toBeInTheDocument();

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  // The composition the whole overlay layer relies on: a tooltipped icon
  // button handed to an overlay as its trigger still opens it.
  it("opens a FormDialog when it's the trigger", async () => {
    render(
      <FormDialog
        trigger={<IconButton label="Add parent" icon={<PlusIcon />} />}
        title="Add a parent"
      >
        {() => <p>The form</p>}
      </FormDialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add parent" }));
    expect(await screen.findByRole("dialog", { name: "Add a parent" })).toBeInTheDocument();
  });

  it("opens a DropdownMenu when it's the trigger", async () => {
    render(
      <DropdownMenu trigger={<IconButton label="Add" icon={<PlusIcon />} />}>
        <DropdownMenuItem>Census</DropdownMenuItem>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("menuitem", { name: "Census" })).toBeInTheDocument();
  });
});
