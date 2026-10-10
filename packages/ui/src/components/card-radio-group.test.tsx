import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { CardRadioGroup } from "./card-radio-group";

const OPTIONS = [
  { value: "nova", label: "Nova", description: "The default", preview: <span>swatches</span> },
  { value: "ink", label: "Ink" },
] as const;

function Picker({ onValueChange }: { onValueChange?: (value: "nova" | "ink") => void }) {
  const [value, setValue] = useState<"nova" | "ink">("nova");
  return (
    <CardRadioGroup
      aria-label="Theme"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      options={OPTIONS}
    />
  );
}

describe("CardRadioGroup", () => {
  it("is a radio group of cards named by their label, the current one checked", () => {
    render(<Picker />);
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Nova/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Ink/ })).not.toBeChecked();
  });

  it("keeps the preview out of the accessible name", () => {
    render(<Picker />);
    expect(screen.getByRole("radio", { name: /Nova/ })).not.toHaveAccessibleName(/swatches/);
  });

  it("reports and moves the choice when another card is clicked", async () => {
    const onValueChange = vi.fn<(value: "nova" | "ink") => void>();
    render(<Picker onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /Ink/ }));
    expect(onValueChange).toHaveBeenCalledWith("ink");
    expect(screen.getByRole("radio", { name: /Ink/ })).toBeChecked();
  });
});
