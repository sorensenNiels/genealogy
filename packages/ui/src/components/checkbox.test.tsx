import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReadOnlyProvider } from "../lib/read-only";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("toggles and reports the new state via onCheckedChange", async () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    render(<Checkbox onCheckedChange={onCheckedChange}>Notify me</Checkbox>);

    const control = screen.getByRole("checkbox", { name: "Notify me" });
    expect(control).not.toBeChecked();

    await userEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles when its label text is clicked", async () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    render(<Checkbox onCheckedChange={onCheckedChange}>Notify me</Checkbox>);

    await userEvent.click(screen.getByText("Notify me"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("reflects a controlled checked value", () => {
    render(<Checkbox checked>Notify me</Checkbox>);
    expect(screen.getByRole("checkbox", { name: "Notify me" })).toBeChecked();
  });

  it("can't be toggled inside a ReadOnlyProvider", async () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    render(
      <ReadOnlyProvider>
        <Checkbox onCheckedChange={onCheckedChange}>Notify me</Checkbox>
      </ReadOnlyProvider>,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "Notify me" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
