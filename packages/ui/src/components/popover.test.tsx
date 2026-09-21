import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { Popover, PopoverContent } from "./popover";

function ExamplePopover() {
  return (
    <Popover>
      <Button>Open popover</Button>
      <PopoverContent>Popover body.</PopoverContent>
    </Popover>
  );
}

describe("Popover", () => {
  it("is closed until opened, then closes again on Escape", async () => {
    const user = userEvent.setup();
    render(<ExamplePopover />);

    expect(screen.queryByText("Popover body.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open popover" }));
    await waitFor(() => expect(screen.getByText("Popover body.")).toBeVisible());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Popover body.")).not.toBeInTheDocument());
  });
});
