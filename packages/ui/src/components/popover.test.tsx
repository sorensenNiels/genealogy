import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { Popover } from "./popover";

describe("Popover", () => {
  it("is closed until opened, then closes again on Escape", async () => {
    render(
      <Popover trigger={<Button>Details</Button>} title="Sources">
        <p>Two citations</p>
      </Popover>,
    );
    expect(screen.queryByText("Two citations")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(await screen.findByText("Two citations")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Sources" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Two citations")).not.toBeInTheDocument());
  });

  it("hands the body a close callback", async () => {
    render(
      <Popover trigger={<Button>Pick</Button>}>
        {(close) => <Button onClick={close}>3 March 1850</Button>}
      </Popover>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Pick" }));
    await userEvent.click(await screen.findByRole("button", { name: "3 March 1850" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "3 March 1850" })).not.toBeInTheDocument(),
    );
  });
});
