import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ReadOnlyProvider } from "../lib/read-only";
import { Select } from "./select";

const SEXES = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "U", label: "Unknown" },
] as const;

function SexSelect({ onValueChange }: { onValueChange?: (value: "M" | "F" | "U") => void }) {
  const [value, setValue] = useState<"M" | "F" | "U">("F");
  return (
    <Select
      aria-label="Sex"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      options={SEXES}
    />
  );
}

describe("Select", () => {
  it("shows the controlled value's label immediately, before ever being opened", () => {
    render(<SexSelect />);
    expect(screen.getByRole("combobox", { name: "Sex" })).toHaveTextContent("Female");
  });

  it("opens, lists every option, and reports the one picked", async () => {
    const onValueChange = vi.fn<(value: "M" | "F" | "U") => void>();
    render(<SexSelect onValueChange={onValueChange} />);

    await userEvent.click(screen.getByRole("combobox", { name: "Sex" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Male",
      "Female",
      "Unknown",
    ]);
    await userEvent.click(screen.getByRole("option", { name: "Male" }));

    expect(onValueChange).toHaveBeenCalledWith("M");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Sex" })).toHaveTextContent("Male"),
    );
  });

  it("shows the placeholder when there's no value", () => {
    render(
      <Select
        aria-label="Source"
        value={null}
        onValueChange={() => {}}
        options={[]}
        placeholder="Choose a source"
      />,
    );
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveTextContent("Choose a source");
  });

  it("is disabled inside a ReadOnlyProvider", () => {
    render(
      <ReadOnlyProvider>
        <SexSelect />
      </ReadOnlyProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Sex" })).toBeDisabled();
  });
});
