import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ColorSwatchPicker } from "./color-swatch-picker";

function ControlledPicker() {
  const [color, setColor] = useState("#111111");
  return (
    <ColorSwatchPicker
      aria-label="Cover colour"
      value={color}
      onChange={setColor}
      colors={["#111111", "#222222", "#333333"]}
    />
  );
}

describe("ColorSwatchPicker", () => {
  it("selects the swatch that's pressed", async () => {
    render(<ControlledPicker />);
    const group = screen.getByRole("radiogroup", { name: "Cover colour" });
    const first = screen.getByRole("radio", { name: "#111111" });
    const second = screen.getByRole("radio", { name: "#222222" });

    expect(first).toBeChecked();
    expect(second).not.toBeChecked();

    await userEvent.click(second);
    expect(second).toBeChecked();
    expect(first).not.toBeChecked();
    expect(group).toBeVisible();
  });
});
