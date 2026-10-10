import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./dropdown-menu";

function Example({ onSignOut = () => {} }: { onSignOut?: () => void }) {
  return (
    <DropdownMenu
      trigger={<Button>Account</Button>}
      header={<DropdownMenuLabel>karen@example.com</DropdownMenuLabel>}
    >
      <DropdownMenuItem>Profile settings</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onSignOut}>
        Sign out
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("is closed until opened, then shows its header and every item", async () => {
    render(<Example />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    await screen.findByRole("menu");
    expect(screen.getByText("karen@example.com")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Profile settings",
      "Sign out",
    ]);
  });

  it("runs the item's onClick and closes when one is chosen", async () => {
    const onSignOut = vi.fn<() => void>();
    render(<Example onSignOut={onSignOut} />);
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});
