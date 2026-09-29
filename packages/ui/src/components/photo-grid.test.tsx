import { User } from "@react-aria/test-utils";
import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PhotoGrid, type Selection } from "./photo-grid";

const testUtilUser = new User({ interactionType: "mouse" });

const ITEMS = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
];

function Demo({ onItemAction }: { onItemAction?: (id: string) => void }) {
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  return (
    <PhotoGrid
      aria-label="Photos"
      items={ITEMS}
      selectedKeys={selectedKeys}
      onSelectionChange={setSelectedKeys}
      {...(onItemAction ? { onItemAction } : {})}
    >
      {(item) => <span>{item.label}</span>}
    </PhotoGrid>
  );
}

describe("PhotoGrid", () => {
  it("selects an item via its checkbox without triggering its action", async () => {
    const onItemAction = vi.fn<(id: string) => void>();
    render(<Demo onItemAction={onItemAction} />);
    const tester = testUtilUser.createTester("GridList", {
      root: screen.getByRole("grid", { name: "Photos" }),
    });

    expect(tester.getSelectedRows()).toHaveLength(0);
    await tester.toggleRowSelection({ row: 0 });
    expect(tester.getSelectedRows()).toHaveLength(1);
    expect(onItemAction).not.toHaveBeenCalled();
  });

  it("fires onItemAction when a row is pressed while nothing is selected", async () => {
    const onItemAction = vi.fn<(id: string) => void>();
    render(<Demo onItemAction={onItemAction} />);
    const tester = testUtilUser.createTester("GridList", {
      root: screen.getByRole("grid", { name: "Photos" }),
    });

    await tester.triggerRowAction({ row: 0 });
    expect(onItemAction).toHaveBeenCalledWith("a");
  });
});
