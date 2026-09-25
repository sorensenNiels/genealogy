import { User } from "@react-aria/test-utils";
import { render, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ButtonRadioGroup } from "./button-radio-group";

const testUtilUser = new User({ interactionType: "mouse" });

type Sex = "M" | "F" | "U";

function SexButtons({
  initial = "U" as Sex,
  onChange,
}: {
  initial?: Sex;
  onChange?: (value: Sex) => void;
}) {
  const [value, setValue] = useState<Sex>(initial);
  return (
    <div data-testid="sex-buttons">
      <ButtonRadioGroup
        aria-label="Gender"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        options={[
          { value: "M", label: "Male" },
          { value: "F", label: "Female" },
          { value: "U", label: "Unknown" },
        ]}
      />
    </div>
  );
}

describe("ButtonRadioGroup", () => {
  it("shows every option, in order, and marks the current value selected", () => {
    const { getByTestId } = render(<SexButtons initial="F" />);
    const root = getByTestId("sex-buttons");
    const tester = testUtilUser.createTester("RadioGroup", { root });

    // getRadios() returns the underlying <input type="radio"> elements —
    // they carry no text content of their own, so read the label text from
    // the <label> React Aria's RadioButton renders each one inside.
    const radios = tester.getRadios();
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
      "Male",
      "Female",
      "Unknown",
    ]);
    expect(tester.getSelectedRadio()).toBe(within(root).getByRole("radio", { name: "Female" }));
  });

  it("calls onChange and moves the selection when a different option is pressed", async () => {
    let lastChange: Sex | undefined;
    const { getByTestId } = render(
      <SexButtons initial="U" onChange={(value) => (lastChange = value)} />,
    );
    const root = getByTestId("sex-buttons");
    const tester = testUtilUser.createTester("RadioGroup", { root });

    await tester.triggerRadio({ radio: within(root).getByRole("radio", { name: "Male" }) });

    expect(lastChange).toBe("M");
    expect(tester.getSelectedRadio()).toBe(within(root).getByRole("radio", { name: "Male" }));
  });
});
