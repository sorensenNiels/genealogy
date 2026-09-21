import { User } from "@react-aria/test-utils";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem } from "./combobox";

const testUtilUser = new User({ interactionType: "mouse" });

interface Option {
  id: string;
  name: string;
}

const PEOPLE: Option[] = [
  { id: "1", name: "Anne Marie Sørensen" },
  { id: "2", name: "Niels Sørensen" },
  { id: "3", name: "Karen Sørensen" },
];

function PeopleCombobox({ onSelect }: { onSelect?: (option: Option) => void }) {
  const [query, setQuery] = useState("");
  const options = PEOPLE.filter((person) =>
    person.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Combobox<Option>
      aria-label="Search people"
      data-testid="people-combobox"
      items={options}
      inputValue={query}
      onInputChange={setQuery}
      onChange={(id) => {
        const match = options.find((person) => person.id === id);
        if (match) onSelect?.(match);
      }}
    >
      <ComboboxInput placeholder="Search people…" />
      <ComboboxContent<Option> renderEmptyState={() => <ComboboxEmpty>No matches.</ComboboxEmpty>}>
        {(item) => <ComboboxItem id={item.id}>{item.name}</ComboboxItem>}
      </ComboboxContent>
    </Combobox>
  );
}

describe("Combobox", () => {
  it("lists every item once opened, even before any typing", async () => {
    const { getByTestId } = render(<PeopleCombobox />);
    const tester = testUtilUser.createTester("ComboBox", { root: getByTestId("people-combobox") });

    await tester.open();
    expect(tester.getOptions().map((option) => option.textContent)).toEqual([
      "Anne Marie Sørensen",
      "Niels Sørensen",
      "Karen Sørensen",
    ]);
  });

  it("narrows the remote-filtered items as the query changes", async () => {
    const { getByTestId } = render(<PeopleCombobox />);
    const tester = testUtilUser.createTester("ComboBox", { root: getByTestId("people-combobox") });

    await tester.open();
    await userEvent.type(tester.getCombobox(), "niels");
    expect(tester.getOptions().map((option) => option.textContent)).toEqual(["Niels Sørensen"]);
  });

  it("calls onChange with the selected item's id", async () => {
    let picked: Option | undefined;
    const { getByTestId } = render(<PeopleCombobox onSelect={(option) => (picked = option)} />);
    const tester = testUtilUser.createTester("ComboBox", { root: getByTestId("people-combobox") });

    await tester.open();
    await tester.toggleOptionSelection({ option: "Karen Sørensen" });
    expect(picked?.id).toBe("3");
  });
});
