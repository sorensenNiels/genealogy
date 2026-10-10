import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReadOnlyProvider } from "../lib/read-only";
import { Switch } from "./switch";

describe("Switch", () => {
  it("toggles and reports the new state via onCheckedChange", async () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    render(<Switch onCheckedChange={onCheckedChange}>Living</Switch>);

    const control = screen.getByRole("switch", { name: "Living" });
    expect(control).not.toBeChecked();

    await userEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles when its label text is clicked", async () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    render(<Switch onCheckedChange={onCheckedChange}>Living</Switch>);

    await userEvent.click(screen.getByText("Living"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("reflects a controlled checked value", () => {
    render(<Switch checked>Living</Switch>);
    expect(screen.getByRole("switch", { name: "Living" })).toBeChecked();
  });

  it("can't be toggled inside a ReadOnlyProvider", async () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    render(
      <ReadOnlyProvider>
        <Switch onCheckedChange={onCheckedChange}>Living</Switch>
      </ReadOnlyProvider>,
    );

    await userEvent.click(screen.getByRole("switch", { name: "Living" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("links a description to the switch", () => {
    render(<Switch description="Shown on the person page">Living</Switch>);
    expect(screen.getByRole("switch", { name: "Living" })).toHaveAccessibleDescription(
      "Shown on the person page",
    );
  });
});
