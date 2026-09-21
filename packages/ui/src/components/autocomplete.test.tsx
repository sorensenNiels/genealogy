import { User } from "@react-aria/test-utils";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Autocomplete } from "./autocomplete";

const testUtilUser = new User({ interactionType: "mouse" });
const OPTIONS = ["Dr.", "Rev.", "Prof."];

function TitleAutocomplete({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <Autocomplete
      aria-label="Title"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={OPTIONS}
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
});
