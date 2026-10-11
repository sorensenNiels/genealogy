import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { reorderIds, SortableGrid } from "./sortable-grid";

const ITEMS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
];

function Demo({ onReorder }: { onReorder: (ids: string[]) => void }) {
  return (
    <SortableGrid
      aria-label="Cards"
      items={ITEMS}
      textValue={(item) => item.label}
      dragLabel={(item) => `Move ${item.label}`}
      onReorder={onReorder}
    >
      {(item) => (
        <div>
          {item.label} <a href="#x">a link</a>
        </div>
      )}
    </SortableGrid>
  );
}

describe("reorderIds", () => {
  const order = ["a", "b", "c", "d"];

  it("moves an item before or after another", () => {
    expect(reorderIds(order, ["d"], "a", "before")).toEqual(["d", "a", "b", "c"]);
    expect(reorderIds(order, ["a"], "c", "after")).toEqual(["b", "c", "a", "d"]);
  });

  it("leaves the order alone for a drop on an item, or on itself", () => {
    expect(reorderIds(order, ["a"], "c", "on")).toEqual(order);
    expect(reorderIds(order, ["b"], "b", "before")).toEqual(order);
  });
});

// The drag itself isn't driven here: React Aria's keyboard drop targets
// depend on layout and timers jsdom doesn't have, and a test of it came out
// flaky — `reorderIds` holds the arithmetic a drop applies, tested above.
describe("SortableGrid", () => {
  it("gives each item a labelled grip handle and keeps its content out of reach", () => {
    render(<Demo onReorder={vi.fn<(ids: string[]) => void>()} />);
    expect(screen.getByRole("button", { name: "Move Alpha" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move Charlie" })).toBeTruthy();
    // Inert while arranging: a link in a card can't be followed mid-drag.
    expect(screen.getByText("Alpha").closest("[inert]")).not.toBeNull();
  });
});
