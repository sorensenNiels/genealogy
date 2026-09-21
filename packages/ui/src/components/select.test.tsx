import { User } from "@react-aria/test-utils";
import { render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

const testUtilUser = new User({ interactionType: "mouse" });

function SexSelect({
  initial = "F" as "M" | "F" | "U",
  onChange,
}: {
  initial?: "M" | "F" | "U";
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Select
      aria-label="Sex"
      data-testid="sex-select"
      value={value}
      onChange={(next) => {
        if (next) {
          setValue(next as "M" | "F" | "U");
          onChange?.(String(next));
        }
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem id="M">M</SelectItem>
        <SelectItem id="F">F</SelectItem>
        <SelectItem id="U">U</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("shows the controlled value immediately, before ever being opened", () => {
    // Regression test: SelectContent/ComboboxContent used to return null
    // until first opened, which emptied React Aria's item collection and
    // broke value-to-label resolution on first render (trigger showed
    // "Select an item" instead of the real value).
    const { getByTestId } = render(<SexSelect initial="F" />);
    const tester = testUtilUser.createTester("Select", { root: getByTestId("sex-select") });
    expect(tester.getTrigger()).toHaveTextContent("F");
  });

  it("opens, lists every option, and calls onChange when a different one is picked", async () => {
    let lastChange: string | undefined;
    const { getByTestId } = render(
      <SexSelect initial="F" onChange={(value) => (lastChange = value)} />,
    );
    const tester = testUtilUser.createTester("Select", { root: getByTestId("sex-select") });

    await tester.open();
    expect(tester.getOptions().map((option) => option.textContent)).toEqual(["M", "F", "U"]);

    await tester.toggleOptionSelection({ option: "M" });
    expect(lastChange).toBe("M");
    expect(tester.getTrigger()).toHaveTextContent("M");
  });

  it("can be opened, closed, and reopened without losing its options", async () => {
    const { getByTestId } = render(<SexSelect initial="U" />);
    const tester = testUtilUser.createTester("Select", { root: getByTestId("sex-select") });

    await tester.open();
    expect(tester.getOptions()).toHaveLength(3);
    await tester.close();
    await tester.open();
    expect(tester.getOptions()).toHaveLength(3);
  });
});
