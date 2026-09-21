import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "./switch";

describe("Switch", () => {
  it("toggles and reports the new state via onChange", async () => {
    const onChange = vi.fn<(isSelected: boolean) => void>();
    render(<Switch onChange={onChange}>Living</Switch>);

    const toggle = screen.getByRole("switch", { name: "Living" });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects a controlled isSelected value", () => {
    render(<Switch isSelected>Living</Switch>);
    expect(screen.getByRole("switch", { name: "Living" })).toBeChecked();
  });
});
