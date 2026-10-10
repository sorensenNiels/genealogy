import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Combobox } from "./combobox";

interface Person {
  id: string;
  name: string;
  born: number;
}

const PEOPLE: Person[] = [
  { id: "1", name: "Anne Marie Sørensen", born: 1850 },
  { id: "2", name: "Niels Sørensen", born: 1847 },
  { id: "3", name: "Karen Hansdatter", born: 1852 },
];

/** Stands in for a remote search: filters by the query, the way the server would. */
function PersonSearch({ onSelect }: { onSelect: (person: Person) => void }) {
  const [query, setQuery] = useState("");
  const items = PEOPLE.filter((person) => person.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <Combobox
      aria-label="Search people"
      items={items}
      itemKey={(person) => person.id}
      itemLabel={(person) => person.name}
      renderItem={(person) => `${person.name} (${person.born})`}
      inputValue={query}
      onInputValueChange={setQuery}
      onSelect={onSelect}
      emptyText="No matches"
    />
  );
}

describe("Combobox", () => {
  it("lists the items once opened, rendered by renderItem", async () => {
    render(<PersonSearch onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Search people" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Anne Marie Sørensen (1850)",
      "Niels Sørensen (1847)",
      "Karen Hansdatter (1852)",
    ]);
  });

  it("shows the items the search narrowed to, and the empty text when none match", async () => {
    render(<PersonSearch onSelect={() => {}} />);
    const input = screen.getByRole("combobox", { name: "Search people" });
    await userEvent.type(input, "sør");
    expect(await screen.findAllByRole("option")).toHaveLength(2);

    await userEvent.type(input, "xyz");
    expect(await screen.findByText("No matches")).toBeInTheDocument();
  });

  it("hands back the picked item", async () => {
    const onSelect = vi.fn<(person: Person) => void>();
    render(<PersonSearch onSelect={onSelect} />);
    await userEvent.type(screen.getByRole("combobox", { name: "Search people" }), "karen");
    await userEvent.click(await screen.findByRole("option", { name: /Karen Hansdatter/ }));
    expect(onSelect).toHaveBeenCalledWith(PEOPLE[2]);
  });
});
