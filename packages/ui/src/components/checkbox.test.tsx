import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("toggles and reports the new state via onChange", async () => {
    const onChange = vi.fn<(isSelected: boolean) => void>();
    render(<Checkbox onChange={onChange}>Notify me</Checkbox>);

    const checkbox = screen.getByRole("checkbox", { name: "Notify me" });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects a controlled isSelected value", () => {
    render(<Checkbox isSelected>Notify me</Checkbox>);
    expect(screen.getByRole("checkbox", { name: "Notify me" })).toBeChecked();
  });
});
