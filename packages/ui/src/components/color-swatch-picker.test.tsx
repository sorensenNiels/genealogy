import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ColorSwatchPicker } from "./color-swatch-picker";

function Picker() {
  const [value, setValue] = useState("#ef4444");
  return (
    <ColorSwatchPicker
      aria-label="Cover color"
      value={value}
      onValueChange={setValue}
      colors={["#ef4444", "#3b82f6", "#22c55e"]}
    />
  );
}

describe("ColorSwatchPicker", () => {
  it("names each swatch by its color and selects the one clicked", async () => {
    render(<Picker />);
    expect(screen.getByRole("radio", { name: "#ef4444" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "#3b82f6" }));
    expect(screen.getByRole("radio", { name: "#3b82f6" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "#ef4444" })).not.toBeChecked();
  });
});
