import { User } from "@react-aria/test-utils";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Autocomplete } from "./autocomplete";

const testUtilUser = new User({ interactionType: "mouse" });
const OPTIONS = ["Dr.", "Rev.", "Prof."];

function TitleAutocomplete({
  onChange,
  isClearable = false,
  initialValue = "",
}: {
  onChange?: (value: string) => void;
  isClearable?: boolean;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Autocomplete
      aria-label="Title"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={OPTIONS}
      isClearable={isClearable}
    />
  );
}

describe("Autocomplete", () => {
  it("suggests every option once opened", async () => {
    render(<TitleAutocomplete />);
    const tester = testUtilUser.createTester("ComboBox", { root: screen.getByRole("combobox") });

    await tester.open();
    expect(tester.getOptions().map((option) => option.textContent)).toEqual(OPTIONS);
  });

  it("narrows suggestions as the query changes", async () => {
    render(<TitleAutocomplete />);
    const tester = testUtilUser.createTester("ComboBox", { root: screen.getByRole("combobox") });

    await tester.open();
    await userEvent.type(tester.getCombobox(), "re");
    expect(tester.getOptions().map((option) => option.textContent)).toEqual(["Rev."]);
  });

  it("commits free text that matches nothing in the list", async () => {
    let committed = "";
    render(<TitleAutocomplete onChange={(value) => (committed = value)} />);

    await userEvent.type(screen.getByRole("combobox"), "Baron");
    expect(committed).toBe("Baron");
  });

  it("shows no clear button unless isClearable is set, even with a value", () => {
    render(<TitleAutocomplete initialValue="Dr." />);
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("hides the clear button when isClearable but the field is empty", () => {
    render(<TitleAutocomplete isClearable />);
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("clears the value when the clear button is clicked", async () => {
    let current = "";
    render(
      <TitleAutocomplete isClearable initialValue="Dr." onChange={(value) => (current = value)} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(current).toBe("");
    expect(screen.getByRole("combobox")).toHaveValue("");
  });
});
