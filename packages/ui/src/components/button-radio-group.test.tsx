import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ReadOnlyProvider } from "../lib/read-only";
import { ButtonRadioGroup } from "./button-radio-group";

const OPTIONS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "U", label: "Unknown" },
] as const;

function Gender({ onValueChange }: { onValueChange?: (value: "M" | "F" | "U") => void }) {
  const [value, setValue] = useState<"M" | "F" | "U">("U");
  return (
    <ButtonRadioGroup
      aria-label="Gender"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      options={OPTIONS}
    />
  );
}

describe("ButtonRadioGroup", () => {
  it("is a radio group of every option, in order, with the current value checked", () => {
    render(<Gender />);
    expect(screen.getByRole("radiogroup", { name: "Gender" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Male",
      "Female",
      "Unknown",
    ]);
    expect(screen.getByRole("radio", { name: "Unknown" })).toBeChecked();
  });

  it("reports and moves the selection when another option is clicked", async () => {
    const onValueChange = vi.fn<(value: "M" | "F" | "U") => void>();
    render(<Gender onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Female" }));
    expect(onValueChange).toHaveBeenCalledWith("F");
    expect(screen.getByRole("radio", { name: "Female" })).toBeChecked();
  });

  it("can't be changed inside a ReadOnlyProvider", async () => {
    const onValueChange = vi.fn<(value: "M" | "F" | "U") => void>();
    render(
      <ReadOnlyProvider>
        <Gender onValueChange={onValueChange} />
      </ReadOnlyProvider>,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Female" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
